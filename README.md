# Aloria

基于 MuJoCo 的机器人仿真与 AI 交互界面：浏览器操作关节、姿态、手势与移动，
所有指令只作用于仿真模型，不连接 ROS 2、真机或任何外部设备。

## 目录

```text
frontend/        页面（入口 frontend/Aloria.html）
backend/         C++17 HTTP 后端，校验并转发到仿真桥
sim/             MuJoCo 桥（mujoco_bridge.py）
scripts/         启动、构建与依赖脚本
third_party/     cpp-httplib 与 nlohmann/json（随仓库提供）
docs/            接口与联调说明
```

## 运行

两个终端，都在项目根目录打开。

**终端 1 —— 仿真桥（:8090）**

```powershell
.venv\Scripts\python.exe sim\mujoco_bridge.py --port 8090 --headless
```

**终端 2 —— 后端（:8080）**

```powershell
.\backend-build\aloria_backend.exe --port 8080 --web-root frontend --sim-url http://127.0.0.1:8090
```

浏览器打开 <http://127.0.0.1:8080/ui/Aloria.html>，在顶栏 Advance 里点「连接仿真」。

### 不开仿真

只启动终端 2，去掉 `--sim-url`：

```powershell
.\backend-build\aloria_backend.exe --port 8080 --web-root frontend
```

### 需要 MuJoCo 原生窗口

终端 1 去掉 `--headless`。

## 关闭

两个终端各按一次 `Ctrl+C`：先关终端 2（后端），再关终端 1（仿真桥）。

如果终端已关闭但端口仍被占用，按 PID 结束：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8080,8090 | Select-Object LocalPort,OwningProcess
Stop-Process -Id <pid>
```

## 依赖

Python 依赖（mujoco、numpy、pillow）都在项目内的 `.venv`，上面的命令直接写了解释器路径，
不需要先激活。想用裸 `python`/`pip` 时再激活：

```powershell
.venv\Scripts\Activate.ps1      # PowerShell；cmd 用 .venv\Scripts\activate.bat
deactivate
```

## 重新构建后端

```powershell
.venv\Scripts\cmake.exe -S backend -B backend-build -G Ninja `
  -DCMAKE_MAKE_PROGRAM="$PWD\.venv\Scripts\ninja.exe" `
  -DPython3_EXECUTABLE="$PWD\.venv\Scripts\python.exe"
.venv\Scripts\cmake.exe --build backend-build
.venv\Scripts\ctest.exe --test-dir backend-build --output-on-failure
```

## 说明

- 仿真模式下 `/api/v1/sim/*`、`/api/v1/motion/*`、`/api/v1/control/*` 转发给 MuJoCo 桥；
  桥未启动时返回 502，不伪装成功。
- 后端与仿真桥只监听 `127.0.0.1`，无认证，不用于局域网多用户。
- 硬件连接（ROS 2 / 真机 / 机型档案）已从项目和界面移除，详见
  [docs/仿真联调.md](docs/仿真联调.md)。