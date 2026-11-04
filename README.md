# IntelliBot

![IntelliBot 智能机器人交互平台](docs/image/intellibot-cover-16x9.png)

基于 MuJoCo 的机器人仿真与浏览器交互项目，支持关节、姿态、手势、底盘控制和可选的 DeepSeek 对话。目前面向 Windows 本地开发。

## 索引

[项目结构](#项目结构) · [快速开始](#快速开始) · [环境要求](#环境要求) · [首次安装](#首次安装) · [运行方式](#运行方式) · [常见问题](#常见问题)

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `frontend/` | 页面、样式、3D 机器人、对话和交互逻辑 |
| `backend/` | C++17 HTTP 后端、认证与会话；`backend/ai/` 为本地对话服务 |
| `sim/` | MuJoCo 仿真桥和动作库 |
| `scripts/` | 下载、构建、启动和验收脚本 |
| `backend/tests/` | 后端接口与认证测试 |
| `sim/tests/` | 仿真控制与动作库测试 |
| `docs/` | 接口和联调说明 |

`backend-build/`、`.venv/`、`third_party/`、`sim/assets/q1-urdf/` 和 `.env` 均为本地内容，不会提交到 Git。

## 快速开始

已经完成过一次环境准备时，在项目根目录运行：

```powershell
.\scripts\run_sim_stack.cmd
```

浏览器打开 <http://127.0.0.1:8080/ui/IntelliBot.html>，点击 `Advance` →「连接仿真」。配置 DeepSeek 后，也可以使用页面底部的对话功能。

> 首次使用、缺少模型或没有 `backend-build\intellibot_backend.exe` 时，请先完成安装。

## 环境要求

| 用途 | 需要 |
| --- | --- |
| 运行仿真 | Git for Windows、64 位 Python 3.11/3.12、Q1 模型、已编译后端 |
| 从源码编译后端 | Visual Studio 2022 的“使用 C++ 的桌面开发”、SQLite3、libsodium |
| 使用 DeepSeek（可选） | DeepSeek API Key |

运行项目不需要 Conda。当前开发版后端已将 SQLite 和 libsodium 静态链接进程序，不依赖额外的 `sqlite3.dll` 或 `libsodium.dll`。Conda 只是重新编译时获取依赖的可选方式。

建议把项目放在纯英文路径中，例如 `C:\dev\IntelliBot`；部分中文路径会导致 MuJoCo 模型加载失败。

## 首次安装

### 1. 获取代码

创建项目文件夹，进入文件夹目录，打开命令行复制代码：

```powershell
git clone https://github.com/UniqueUpstart/IntelliBot.git
```

### 2. 创建 Python 环境

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r sim\requirements.txt
```

如果安装的是 Python 3.11，把 `py -3.12` 改为 `py -3.11`。后续直接使用 `.venv\Scripts\python.exe`，无需激活环境。

### 3. 配置 ai

复制配置模板并填写自己的 API Key：

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` 已被 Git 忽略，不要提交真实 Key。未配置 Key 时，网页和 MuJoCo 仿真仍可正常使用，只会关闭 AI 对话。

### 4. 下载机器人模型

在 Git Bash 中执行：

```bash
bash scripts/fetch_model.sh
```

确认模型文件存在：

```text
sim/assets/q1-urdf/xml/q1_v3_mc.xml
```

### 5. 准备后端程序

在 Git Bash 中编译：

```bash
bash scripts/fetch_deps.sh
bash scripts/build_backend.sh
```

Windows 构建脚本会使用 Visual Studio 自带的 CMake 和 Ninja。如果提示缺少 SQLite3 或 sodium，可选择安装 Miniconda 后执行：

```powershell
conda install -n base -c conda-forge sqlite libsodium -y
```

然后重新运行 `scripts/build_backend.sh`。

## 运行方式

### 一键启动

双击 `scripts\run_sim_stack.cmd`，或在项目根目录执行：

```powershell
.\scripts\run_sim_stack.cmd
```

脚本会根据环境启动：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| MuJoCo 仿真桥 | `127.0.0.1:8090` | 默认 `--headless` |
| C++ 后端与网页 | `127.0.0.1:8080` | 自动连接仿真桥 |
| 本地模型服务 | `127.0.0.1:8091` | 启动后可在网页左侧 Models 面板配置服务商、API 地址、模型与 Key |

`run_sim_stack.cmd` 只负责启动，不会安装环境、下载模型或编译后端。

### 分开启动

使用模型配置功能时保留终端 2，并让后端带 `--ai-url` 参数。也可先用 `.env.example` 提供初始配置，再在网页中覆盖。

终端 1，MuJoCo 仿真桥：

```powershell
.\.venv\Scripts\python.exe sim\mujoco_bridge.py --port 8090 --headless
```

终端 2，本地模型服务：

```powershell
.\.venv\Scripts\python.exe backend\ai\deepseek_bridge.py --port 8091
```

终端 3，C++ 后端：

```powershell
.\backend-build\intellibot_backend.exe `
  --legacy-dev `
  --port 8080 `
  --web-root frontend `
  --sim-url http://127.0.0.1:8090 `
  --ai-url http://127.0.0.1:8091
```

打开 <http://127.0.0.1:8080/ui/IntelliBot.html>，再点击「连接仿真」。

### 原生 MuJoCo 窗口

```powershell
$env:SIM_MODE = "viewer"
.\scripts\run_sim_stack.cmd
```

原生窗口模式没有网页实时画面，网页只显示状态和控制器。

### 修改端口

```powershell
$env:PORT = "8081"
$env:SIM_PORT = "8092"
$env:AI_PORT = "8093"
.\scripts\run_sim_stack.cmd
```

访问 `http://127.0.0.1:8081/ui/IntelliBot.html`。

### 账号体验页

账号功能使用后端的完整 Web 模式：

```powershell
.\backend-build\intellibot_backend.exe `
  --port 8080 `
  --web-root frontend `
  --db-path data\intellibot.db
```

打开 <http://127.0.0.1:8080/ui/experience.html>。它与 MuJoCo 控制页是两个独立入口。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 一键启动提示缺少 MuJoCo | 检查 `.venv`；脚本会优先使用 `.venv\Scripts\python.exe`，环境失效时需要重建 |
| 分开启动正常，一键启动失败 | 临时指定系统 Python：`$env:PYTHON = (Get-Command python).Source` |
| 提示模型不存在 | 运行 `bash scripts/fetch_model.sh`，并确认模型路径为纯英文 |
| 页面返回 `502 SIM_UNAVAILABLE` | 仿真桥没有启动；检查 `http://127.0.0.1:8090/health` |
| 有数值但没有机器人画面 | 确认仿真桥使用 `--headless`，并查看启动窗口中的 GL 报错 |
| 模型对话不可用 | 在左侧 Models 面板保存 API 配置，并确认 `http://127.0.0.1:8091/health` 可访问 |
| 编译提示缺少 SQLite3 或 sodium | 只影响源码编译；安装 Miniconda 依赖后重新构建 |
| 端口被占用 | `Get-NetTCPConnection -State Listen -LocalPort 8080,8090,8091` 查看占用进程 |
| 直接双击 HTML 无法连接 | 网页必须通过 `http://127.0.0.1:8080` 打开 |

## 设计边界

- 仅连接本地 MuJoCo，不连接 ROS 2 或真实机器人。
- `--legacy-dev` 关闭账号认证，只适合本机开发，不应暴露到局域网或公网。
- 仿真桥不可用时返回 502，不会把未执行的控制命令报告为成功。
- DeepSeek 只返回回复文字和现有动作 ID；动作仍由本地白名单校验。
- 对话最多依次执行四个动作，并支持通过文字或界面停止。

接口细节见 [仿真联调](docs/仿真联调.md)，认证接口见 [后端说明](backend/README.md)。
