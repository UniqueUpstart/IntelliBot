from __future__ import annotations

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
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length))
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
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


def call(port: int, method: str, path: str, body=None, key: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
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


backend_port = free_port()
ai_port = free_port()
ai = ThreadingHTTPServer(("127.0.0.1", ai_port), FakeAiHandler)
ai_thread = threading.Thread(target=ai.serve_forever, daemon=True)
ai_thread.start()
backend = subprocess.Popen(
    [
        sys.argv[1],
        "--legacy-dev",
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
    assert call(backend_port, "GET", "/capabilities")[1]["data"]["chat"] is True

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
    print("PASS: chat validation, AI proxy, error mapping, capabilities, non-blocking requests")
finally:
    backend.terminate()
    backend.wait(timeout=5)
    ai.shutdown()
    ai.server_close()
