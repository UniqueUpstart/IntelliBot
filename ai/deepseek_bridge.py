from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from motion_library import GESTURES, gesture_metadata


API_URL = "https://api.deepseek.com/chat/completions"
MAX_BODY_BYTES = 8192
MAX_MESSAGE_CHARS = 500
MAX_HISTORY_ITEMS = 10
CACHE_TTL_S = 600
CACHE_LIMIT = 1024

# 主页拥有一段不属于 MuJoCo 动作库的全身街舞。单独列出可以让 AI 调用它，
# 又不会把无法在 MuJoCo 中执行的动作混进 sim.motion_library.GESTURES。
HOME_ACTIONS = (
    {
        "id": "street_dance",
        "name": "街舞",
        "description": "20 秒全身 Hip-hop 演示舞，包含摆臂、踏步、走位和转身",
        "aliases": ["街舞", "跳街舞", "来段街舞", "hip-hop", "hiphop"],
    },
)
SUPPORTED_ACTION_IDS = frozenset(GESTURES) | {item["id"] for item in HOME_ACTIONS}


class BridgeError(RuntimeError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Config:
    api_key: str
    model: str = "deepseek-flash"
    timeout_s: float = 30.0


@dataclass
class CachedResponse:
    fingerprint: str
    status: int
    payload: dict
    created_at: float


def _read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def load_config() -> Config:
    file_values = _read_env(ROOT / ".env")
    api_key = os.environ.get("DEEPSEEK_API_KEY", file_values.get("DEEPSEEK_API_KEY", "")).strip()
    model = os.environ.get("DEEPSEEK_MODEL", file_values.get("DEEPSEEK_MODEL", "deepseek-flash")).strip()
    if not api_key:
        raise BridgeError(503, "AI_NOT_CONFIGURED", "未配置 DEEPSEEK_API_KEY")
    if model not in {"deepseek-flash", "deepseek-v4-pro"}:
        raise BridgeError(503, "AI_NOT_CONFIGURED", "DEEPSEEK_MODEL 只能是 deepseek-flash 或 deepseek-v4-pro")
    return Config(api_key=api_key, model=model)


def validate_chat_request(value: object) -> tuple[str, list[dict[str, str]]]:
    if not isinstance(value, dict):
        raise BridgeError(400, "INVALID_CHAT_REQUEST", "请求体必须是 JSON 对象")
    message = value.get("message")
    if not isinstance(message, str) or not message.strip() or len(message) > MAX_MESSAGE_CHARS:
        raise BridgeError(400, "INVALID_CHAT_MESSAGE", "message 需为 1 至 500 个字符")
    history = value.get("history", [])
    if not isinstance(history, list) or len(history) > MAX_HISTORY_ITEMS:
        raise BridgeError(400, "INVALID_CHAT_HISTORY", "history 最多包含 10 条消息")
    normalized: list[dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            raise BridgeError(400, "INVALID_CHAT_HISTORY", "history 中的消息格式不正确")
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            raise BridgeError(400, "INVALID_CHAT_HISTORY", "history 只接受 user 和 assistant 文本")
        if not content.strip() or len(content) > MAX_MESSAGE_CHARS:
            raise BridgeError(400, "INVALID_CHAT_HISTORY", "history 消息需为 1 至 500 个字符")
        normalized.append({"role": role, "content": content})
    return message.strip(), normalized


def _system_prompt() -> str:
    catalog = [
        {
            "id": item["id"],
            "name": item["label"],
            "description": item["description"],
            "aliases": item["aliases"],
        }
        for item in gesture_metadata()
    ] + list(HOME_ACTIONS)
    return (
        "你是 IntelliBot，一台友好、简洁的机器人助手。请用用户使用的语言回答。"
        "只有用户明确要求机器人做动作时，才从白名单选择动作；普通问答和自我介绍不得执行动作。"
        "用户用‘先、再、然后、接着’要求多个动作时，actions 必须按原顺序返回，最多四个；"
        "同一动作要求多次时可以重复相同 ID。"
        "用户明确说‘街舞、跳街舞、hip-hop’时选择 street_dance；只说‘舞动’时选择 dance。"
        "用户要求停止、别动或取消动作时 stop=true，回复中明确说明已经停止。"
        "含有‘不要、别、无需’的动作不得执行，除非整句是在要求停止当前动作。"
        "不支持的动作必须说明暂不支持，不得选择相似动作代替。"
        "结合最近对话理解‘再来一次、继续、换一个’等指代，但不得凭空增加动作。"
        "只输出 JSON，不要输出 Markdown 或额外文字。"
        "JSON 格式固定为 {\"reply\":\"回复文字\",\"actions\":[动作ID],\"stop\":false}。"
        "stop=true 时 actions 必须为空。"
        "禁止输出关节角度、代码或白名单以外的动作。动作白名单："
        + json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    )


def _request_payload(config: Config, message: str, history: list[dict[str, str]]) -> dict:
    return {
        "model": config.model,
        "messages": [
            {"role": "system", "content": _system_prompt()},
            *history,
            {"role": "user", "content": message},
        ],
        "thinking": {"type": "disabled"},
        "temperature": 0.2,
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
    }


def _default_open(request: urllib.request.Request, timeout: float):
    return urllib.request.urlopen(request, timeout=timeout)


def _call_once(
    config: Config,
    message: str,
    history: list[dict[str, str]],
    opener: Callable = _default_open,
) -> tuple[str, str]:
    body = json.dumps(_request_payload(config, message, history), ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "IntelliBot/0.1",
        },
    )
    try:
        with opener(request, timeout=config.timeout_s) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise BridgeError(429, "AI_RATE_LIMITED", "DeepSeek 请求过于频繁，请稍后重试") from error
        if error.code in {401, 403}:
            raise BridgeError(502, "AI_AUTH_FAILED", "DeepSeek API Key 无效或无权访问该模型") from error
        raise BridgeError(502, "AI_UPSTREAM_ERROR", f"DeepSeek 返回 HTTP {error.code}") from error
    except (TimeoutError, urllib.error.URLError) as error:
        raise BridgeError(502, "AI_UNAVAILABLE", "无法连接 DeepSeek，请检查网络后重试") from error
    except (UnicodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 返回了无法解析的响应") from error

    try:
        content = payload["choices"][0]["message"]["content"]
        model = str(payload.get("model") or config.model)
    except (KeyError, IndexError, TypeError) as error:
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 响应缺少回复内容") from error
    if not isinstance(content, str):
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 回复内容格式不正确")
    return content, model


def chat(
    config: Config,
    message: str,
    history: list[dict[str, str]],
    opener: Callable = _default_open,
) -> dict:
    content = ""
    model = config.model
    for _ in range(2):
        content, model = _call_once(config, message, history, opener)
        if content.strip():
            break
    if not content.strip():
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 返回了空白 JSON，请重试")
    try:
        result = json.loads(content)
    except json.JSONDecodeError as error:
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 返回的内容不是合法 JSON") from error
    if not isinstance(result, dict):
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 返回的 JSON 不是对象")
    reply = result.get("reply")
    raw_actions = result.get("actions")
    if raw_actions is None and "action_id" in result:
        raw_actions = [] if result["action_id"] is None else [result["action_id"]]
    stop = result.get("stop", False)
    if not isinstance(reply, str) or not reply.strip():
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 回复缺少 reply")
    if not isinstance(raw_actions, list) or len(raw_actions) > 4 or not isinstance(stop, bool):
        raise BridgeError(502, "AI_INVALID_RESPONSE", "DeepSeek 动作指令格式不正确")
    reply = reply.strip()[:MAX_MESSAGE_CHARS]
    actions = [
        action
        for action in raw_actions
        if isinstance(action, str) and action in SUPPORTED_ACTION_IDS
    ]
    if stop:
        actions = []
    return {
        "reply": reply,
        "action_id": actions[0] if actions else None,
        "actions": actions,
        "stop": stop,
        "model": model,
    }


class BridgeState:
    def __init__(self, config: Config, opener: Callable = _default_open):
        self.config = config
        self.opener = opener
        self.cache: dict[str, CachedResponse] = {}
        self.lock = threading.Lock()

    def run_chat(self, key: str, body: bytes) -> tuple[int, dict]:
        fingerprint = hashlib.sha256(body).hexdigest()
        now = time.monotonic()
        with self.lock:
            self.cache = {
                cache_key: item
                for cache_key, item in self.cache.items()
                if now - item.created_at <= CACHE_TTL_S
            }
            cached = self.cache.get(key)
            if cached:
                if cached.fingerprint != fingerprint:
                    raise BridgeError(409, "AI_IDEMPOTENCY_CONFLICT", "相同请求键不能提交不同内容")
                return cached.status, cached.payload
            if len(self.cache) >= CACHE_LIMIT:
                raise BridgeError(503, "AI_CACHE_FULL", "AI 请求缓存已满，请稍后重试")

        try:
            value = json.loads(body.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as error:
            raise BridgeError(400, "INVALID_JSON", "请求体必须是 JSON 对象") from error
        message, history = validate_chat_request(value)
        payload = chat(self.config, message, history, self.opener)
        with self.lock:
            self.cache[key] = CachedResponse(fingerprint, 200, payload, now)
        return 200, payload


def make_handler(state: BridgeState):
    class Handler(BaseHTTPRequestHandler):
        server_version = "IntelliBotAI/0.1"

        def _json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if self.path != "/health":
                self._json(404, {"error": {"code": "NOT_FOUND", "message": "接口不存在"}})
                return
            self._json(
                200,
                {
                    "ok": True,
                    "model": state.config.model,
                    "actions": [item["id"] for item in gesture_metadata()],
                },
            )

        def do_POST(self) -> None:
            if self.path != "/chat":
                self._json(404, {"error": {"code": "NOT_FOUND", "message": "接口不存在"}})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_BODY_BYTES:
                    raise BridgeError(413, "BODY_TOO_LARGE", "请求体需为 1 至 8192 字节")
                key = self.headers.get("Idempotency-Key", "")
                if not key or len(key) > 128:
                    raise BridgeError(400, "INVALID_IDEMPOTENCY_KEY", "需要 1 至 128 字节的 Idempotency-Key")
                status, payload = state.run_chat(key, self.rfile.read(length))
                self._json(status, payload)
            except BridgeError as error:
                self._json(error.status, {"error": {"code": error.code, "message": error.message}})
            except Exception:
                self._json(500, {"error": {"code": "INTERNAL_ERROR", "message": "AI 服务内部错误"}})

        def log_message(self, fmt: str, *args) -> None:
            print(f"[ai] {self.address_string()} {fmt % args}")

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="IntelliBot DeepSeek 本地服务")
    parser.add_argument("--port", type=int, default=8091)
    parser.add_argument("--check-config", action="store_true")
    args = parser.parse_args()
    try:
        config = load_config()
    except BridgeError as error:
        print(f"[ai] {error.message}", file=sys.stderr)
        return 2
    if args.check_config:
        print(f"[ai] configured model={config.model}")
        return 0
    if not 1 <= args.port <= 65535:
        print("[ai] 端口需在 1 至 65535 之间", file=sys.stderr)
        return 2
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(BridgeState(config)))
    print(f"[ai] ready http://127.0.0.1:{args.port} model={config.model}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
