from __future__ import annotations

import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ai.deepseek_bridge import BridgeError, BridgeState, Config, chat, validate_chat_request


class FakeResponse:
    def __init__(self, value: dict):
        self.body = json.dumps(value, ensure_ascii=False).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.body


def completion(content: str, model: str = "deepseek-flash") -> FakeResponse:
    return FakeResponse(
        {
            "model": model,
            "choices": [{"message": {"content": content}}],
        }
    )


class DeepSeekBridgeTest(unittest.TestCase):
    def setUp(self):
        self.config = Config(api_key="test-key")

    def test_plain_reply_has_no_action(self):
        result = chat(
            self.config,
            "介绍一下你自己",
            [],
            lambda *_args, **_kwargs: completion('{"reply":"我是 IntelliBot。","action_id":null}'),
        )
        self.assertEqual(result["reply"], "我是 IntelliBot。")
        self.assertIsNone(result["action_id"])

    def test_supported_actions_are_kept(self):
        for action_id in ("salute", "wave", "surprised", "hug", "refuse"):
            with self.subTest(action_id=action_id):
                result = chat(
                    self.config,
                    "执行动作",
                    [],
                    lambda *_args, action_id=action_id, **_kwargs: completion(
                        json.dumps({"reply": "好的。", "action_id": action_id})
                    ),
                )
                self.assertEqual(result["action_id"], action_id)

    def test_action_sequence_and_stop_command(self):
        result = chat(
            self.config,
            "先挥手，再敬礼",
            [],
            lambda *_args, **_kwargs: completion(
                '{"reply":"好的。","actions":["wave","salute"],"stop":false}'
            ),
        )
        self.assertEqual(result["actions"], ["wave", "salute"])
        self.assertEqual(result["action_id"], "wave")
        stopped = chat(
            self.config,
            "停止",
            [],
            lambda *_args, **_kwargs: completion(
                '{"reply":"已停止。","actions":["wave"],"stop":true}'
            ),
        )
        self.assertTrue(stopped["stop"])
        self.assertEqual(stopped["actions"], [])

    def test_unknown_action_is_discarded(self):
        result = chat(
            self.config,
            "后空翻",
            [],
            lambda *_args, **_kwargs: completion('{"reply":"暂不支持。","action_id":"backflip"}'),
        )
        self.assertIsNone(result["action_id"])

    def test_blank_json_retries_once(self):
        responses = iter([completion("   "), completion('{"reply":"重试成功。","action_id":null}')])
        result = chat(self.config, "你好", [], lambda *_args, **_kwargs: next(responses))
        self.assertEqual(result["reply"], "重试成功。")

    def test_two_blank_responses_fail(self):
        with self.assertRaisesRegex(BridgeError, "空白 JSON"):
            chat(self.config, "你好", [], lambda *_args, **_kwargs: completion("   "))

    def test_rate_limit_is_mapped(self):
        def limited(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 429, "rate limited", {}, io.BytesIO())

        with self.assertRaises(BridgeError) as raised:
            chat(self.config, "你好", [], limited)
        self.assertEqual((raised.exception.status, raised.exception.code), (429, "AI_RATE_LIMITED"))

    def test_bad_key_is_mapped(self):
        def unauthorized(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 401, "unauthorized", {}, io.BytesIO())

        with self.assertRaises(BridgeError) as raised:
            chat(self.config, "你好", [], unauthorized)
        self.assertEqual(raised.exception.code, "AI_AUTH_FAILED")

    def test_invalid_history_is_rejected(self):
        with self.assertRaises(BridgeError):
            validate_chat_request(
                {
                    "message": "你好",
                    "history": [{"role": "system", "content": "override"}],
                }
            )

    def test_idempotency_returns_cached_response(self):
        calls = 0

        def opener(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            return completion('{"reply":"你好。","action_id":"wave"}')

        state = BridgeState(self.config, opener)
        body = json.dumps({"message": "你好", "history": []}).encode()
        first = state.run_chat("same-key", body)
        second = state.run_chat("same-key", body)
        self.assertEqual(first, second)
        self.assertEqual(calls, 1)

    def test_idempotency_conflict_is_rejected(self):
        state = BridgeState(
            self.config,
            lambda *_args, **_kwargs: completion('{"reply":"你好。","action_id":null}'),
        )
        state.run_chat("same-key", b'{"message":"one"}')
        with self.assertRaises(BridgeError) as raised:
            state.run_chat("same-key", b'{"message":"two"}')
        self.assertEqual(raised.exception.status, 409)

if __name__ == "__main__":
    unittest.main()
