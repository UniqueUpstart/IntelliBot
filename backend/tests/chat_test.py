from __future__ import annotations

import tempfile
import sqlite3
import json
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class FakeAiHandler(BaseHTTPRequestHandler):
    model = "deepseek-flash"

    def do_GET(self):
        if self.path == "/config":
            self.reply(200, {
                "provider": "deepseek",
                "base_url": "https://api.deepseek.com",
                "model": self.model,
                "configured": True,
                "key_hint": "••••test",
            })
            return
        self.reply(404, {"error": {"code": "NOT_FOUND", "message": "missing"}})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length))
        seen_keys.append(self.headers.get("Idempotency-Key"))
        if self.path == "/speech":
            if body.get("text") and body.get("voice") == "zh-CN-XiaoxiaoNeural":
                self.reply_bytes(200, b"ID3\x04fake-mp3", "audio/mpeg")
            else:
                self.reply(400, {"error": {"code": "INVALID_SPEECH", "message": "invalid"}})
            return
        if self.path == "/config":
            self.model = body.get("model", self.model)
            self.reply(200, {
                "provider": body.get("provider", "deepseek"),
                "base_url": body.get("base_url", "https://api.deepseek.com"),
                "model": self.model,
                "configured": True,
                "key_hint": "••••test",
            })
            return
        message = body.get("message", "")
        if message == "rate":
            self.reply(429, {"error": {"code": "AI_RATE_LIMITED", "message": "later"}})
            return
        if message == "invalid-action":
            self.reply(
                200,
                {
                    "reply": "错误动作",
                    "action_id": "backflip",
                    "actions": ["backflip"],
                    "stop": False,
                    "model": "deepseek-flash",
                },
            )
            return
        if message == "invalid-command":
            self.reply(
                200,
                {
                    "reply": "错误命令",
                    "action_id": None,
                    "actions": [],
                    "commands": [{"type": "view", "preset": "ceiling"}],
                    "stop": False,
                    "model": "deepseek-flash",
                },
            )
            return
        if message == "commands":
            self.reply(
                200,
                {
                    "reply": "组合命令",
                    "action_id": "belly_laugh",
                    "actions": ["belly_laugh"],
                    "commands": [
                        {"type": "view", "preset": "front"},
                        {"type": "pose", "id": "idle"},
                        {"type": "motion", "id": "belly_laugh"},
                        {"type": "emotion", "id": "happy"},
                    ],
                    "stop": False,
                    "model": "custom-model",
                },
            )
            return
        if message in {
            "surprised", "hug", "refuse",
            "mechanical_dance", "disco_dance",
            "cheer_roar", "martial_salute", "march_in_place",
            "applause", "point_forward",
        }:
            self.reply(200, {"reply":"好的", "action_id":message, "actions":[message], "stop":False, "model":"deepseek-flash"})
            return
        if message == "slow":
            time.sleep(1.2)
        self.reply(
            200,
            {
                "reply": "当然可以。",
                "action_id": "salute",
                "actions": ["salute", "wave"],
                "stop": False,
                "model": "deepseek-flash",
            },
        )

    def reply(self, status: int, value: dict):
        data = json.dumps(value).encode()
        self.reply_bytes(status, data, "application/json")

    def reply_bytes(self, status: int, data: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


auth_token = None
seen_keys = []

def call(port: int, method: str, path: str, body=None, key: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = "Bearer " + auth_token
    if key is not None:
        headers["Idempotency-Key"] = key
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/v1{path}",
        data=data,
        method=method,
        headers=headers,
    )
    try:
        response = urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, json.load(response)


def call_raw(port: int, method: str, path: str, body, key: str | None = None):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = "Bearer " + auth_token
    if key is not None:
        headers["Idempotency-Key"] = key
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/v1{path}",
        data=data,
        method=method,
        headers=headers,
    )
    try:
        response = urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers.get("Content-Type", ""), response.read()


backend_port = free_port()
ai_port = free_port()
ai = ThreadingHTTPServer(("127.0.0.1", ai_port), FakeAiHandler)
ai_thread = threading.Thread(target=ai.serve_forever, daemon=True)
ai_thread.start()
authenticated = "--authenticated" in sys.argv
tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
backend = subprocess.Popen(
    [
        sys.argv[1],
        *(["--db-path", tmp.name + "/users.db"] if authenticated else ["--legacy-dev"]),
        "--port",
        str(backend_port),
        "--ai-url",
        f"http://127.0.0.1:{ai_port}",
    ],
    stdout=subprocess.DEVNULL,
)
try:
    for _ in range(100):
        try:
            if call(backend_port, "GET", "/health")[0] == 200:
                break
        except OSError:
            time.sleep(0.05)
    else:
        raise AssertionError("backend did not start")

    if authenticated:
        assert call(backend_port, "POST", "/chat", {"message":"你好"}, "shared-key")[0] == 401
        assert not seen_keys, "unauthorized request reached AI"
        assert call(backend_port, "POST", "/auth/register",
                    {"username":"alice", "password":"Password123"})[0] == 201
        code, result = call(backend_port, "POST", "/auth/login",
                            {"username":"alice", "password":"Password123"})
        assert code == 200
        auth_token = result["data"]["access_token"]
        assert call(backend_port, "POST", "/motion/base", {"vx":1}, "dev-key")[0] == 403

    for action in [
        "surprised", "hug", "refuse",
        "mechanical_dance", "disco_dance",
    ]:
        code, result = call(backend_port, "POST", "/chat", {"message":action}, str(uuid4()))
        assert code == 200 and result["data"]["actions"] == [action], (code,result)
    for action in [
        "cheer_roar", "martial_salute", "march_in_place",
        "applause", "point_forward",
    ]:
        code, result = call(backend_port, "POST", "/chat", {"message":action}, str(uuid4()))
        assert code == 502 and result["error"]["code"] == "AI_INVALID_RESPONSE", (code,result)

    code, content_type, audio = call_raw(
        backend_port,
        "POST",
        "/ai/speech",
        {"text": "你好", "voice": "zh-CN-XiaoxiaoNeural"},
        str(uuid4()),
    )
    assert code == 200 and content_type.startswith("audio/mpeg"), (code, content_type)
    assert audio == b"ID3\x04fake-mp3", audio

    status, payload = call(
        backend_port,
        "POST",
        "/chat",
        {"message": "请敬礼", "history": []},
        str(uuid4()),
    )
    assert status == 200, payload
    assert payload["data"] == {
        "reply": "当然可以。",
        "action_id": "salute",
        "actions": ["salute", "wave"],
        "stop": False,
        "model": "deepseek-flash",
    }
    assert call(backend_port, "POST", "/chat", {"message": "你好"})[0] == 400
    assert call(backend_port, "POST", "/chat", {"message": " "}, str(uuid4()))[0] == 400
    status, payload = call(backend_port, "POST", "/chat", {"message": "rate"}, str(uuid4()))
    assert status == 429 and payload["error"]["code"] == "AI_RATE_LIMITED"
    status, payload = call(backend_port, "POST", "/chat", {"message": "invalid-action"}, str(uuid4()))
    assert status == 502 and payload["error"]["code"] == "AI_INVALID_RESPONSE"
    status, payload = call(backend_port, "POST", "/chat", {"message": "commands"}, str(uuid4()))
    assert status == 200, payload
    assert payload["data"]["commands"] == [
        {"type": "view", "preset": "front"},
        {"type": "pose", "id": "idle"},
        {"type": "motion", "id": "belly_laugh"},
        {"type": "emotion", "id": "happy"},
    ]
    status, payload = call(backend_port, "POST", "/chat", {"message": "invalid-command"}, str(uuid4()))
    assert status == 502 and payload["error"]["code"] == "AI_INVALID_RESPONSE"
    if not authenticated:
        assert call(backend_port, "GET", "/capabilities")[1]["data"]["chat"] is True
    status, payload = call(backend_port, "GET", "/ai/config")
    assert status == 200 and "key_hint" in payload["data"] and "api_key" not in payload["data"]
    status, payload = call(
        backend_port,
        "PUT",
        "/ai/config",
        {"model": "deepseek-reasoner"},
        str(uuid4()),
    )
    assert status == 200 and payload["data"]["model"] == "deepseek-reasoner"

    slow_result = []
    thread = threading.Thread(
        target=lambda: slow_result.append(
            call(backend_port, "POST", "/chat", {"message": "slow"}, str(uuid4()))
        )
    )
    thread.start()
    time.sleep(0.15)
    started = time.monotonic()
    assert call(backend_port, "GET", "/health")[0] == 200
    assert time.monotonic() - started < 0.5
    thread.join(timeout=3)
    assert slow_result and slow_result[0][0] == 200
    if authenticated:
        assert call(backend_port, "POST", "/chat", {"message":"你好"}, "shared-key")[0] == 200
        first_key = seen_keys[-1]
        assert call(backend_port, "POST", "/chat", {"message":"你好"}, "shared-key")[0] == 200
        assert seen_keys[-1] == first_key
        first_token = auth_token
        auth_token = None
        _, login = call(backend_port, "POST", "/auth/login",
                        {"username":"alice", "password":"Password123"})
        auth_token = login["data"]["access_token"]
        assert call(backend_port, "POST", "/chat", {"message":"你好"}, "shared-key")[0] == 200
        assert seen_keys[-1] != first_key and first_token not in seen_keys[-1]
        assert call(backend_port, "POST", "/auth/logout", {})[0] == 200
        before = len(seen_keys)
        assert call(backend_port, "POST", "/chat", {"message":"你好"}, "logout")[0] == 401
        auth_token = first_token
        with sqlite3.connect(tmp.name + "/users.db") as db:
            db.execute("UPDATE sessions SET expires_at=0")
        assert call(backend_port, "POST", "/chat", {"message":"你好"}, "expired")[0] == 401
        assert len(seen_keys) == before
    print("PASS: chat validation, AI proxy, error mapping, capabilities, non-blocking requests")
finally:
    backend.terminate()
    backend.wait(timeout=5)
    ai.shutdown()
    ai.server_close()
    tmp.cleanup()
