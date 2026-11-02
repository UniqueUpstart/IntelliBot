# IntelliBot 后端 0.1.0

C++17 HTTP 后端，只做仿真：把浏览器请求校验后转发给 MuJoCo 桥，并在桥不可用时如实报错。
不连接 ROS 2、真机或任何外部服务。

依赖随仓库提供（`third_party/`），运行只需构建好的 `backend-build/intellibot_backend.exe`。

```powershell
# 构建（使用仓库内 .venv 的 cmake / ninja）
.venv\Scripts\cmake.exe -S backend -B backend-build -G Ninja `
  -DCMAKE_MAKE_PROGRAM="$PWD\.venv\Scripts\ninja.exe" `
  -DPython3_EXECUTABLE="$PWD\.venv\Scripts\python.exe"
.venv\Scripts\cmake.exe --build backend-build

# 测试
.venv\Scripts\ctest.exe --test-dir backend-build --output-on-failure

# 运行
.\backend-build\intellibot_backend.exe --port 8080 --web-root frontend --sim-url http://127.0.0.1:8090
```

不带 `--sim-url` 时是纯 mock：`/api/v1/sim/*`、`/api/v1/motion/*`、`/api/v1/control/*` 一律 422。

仅监听 `127.0.0.1`。每次进程重启，模拟状态、操作记录和日志清空。

```powershell
curl http://127.0.0.1:8080/api/v1/health
curl -X POST http://127.0.0.1:8080/api/v1/connections -H 'Content-Type: application/json' -H 'Idempotency-Key: sim-1' -d '{"mode":"sim"}'
curl -X POST http://127.0.0.1:8080/api/v1/tts -H 'Content-Type: application/json' -H 'Idempotency-Key: tts-1' -d '{"text":"你好，IntelliBot","interrupt":false}'
curl http://127.0.0.1:8080/api/v1/logs
```

每个新操作使用新的 `Idempotency-Key`；重复同键同内容返回原结果。
返回 `simulated` / `sim_executed=false` 表示只在内存里记录，没有驱动仿真模型。

接口与界面说明见 [docs/仿真联调.md](../docs/仿真联调.md)。