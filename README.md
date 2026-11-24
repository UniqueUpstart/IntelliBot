# IntelliBot

![IntelliBot 智能机器人交互平台](docs/image/intellibot-cover-16x9.png)

IntelliBot 是一个浏览器端智能机器人交互平台。首页提供实时 3D 机器人、表情与动作演示、角色设定、AI 对话、语音朗读、账号状态保存和动作卡片管理。

## 快速开始

获取代码后，在项目根目录执行：

```powershell
python run.py
```

首次运行时，启动器会自动：

1. 在项目内创建或修复 `.venv`；
2. 把 Python 依赖、CMake 和 Ninja 安装到 `.venv`；
3. 把两个 C++ 头文件下载到 `third_party/`；
4. 在 `backend-build/` 中编译 C++ 后端；
5. 启动 AI 服务和后端；
6. 按原有方式打开 <http://127.0.0.1:8080/ui/IntelliBot.html>。

启动器不会自动打开 AI 模型设置页，也不会改变原来的首页和登录流程。后续再次运行 `python run.py` 时会复用已经准备好的项目环境，只做增量编译。按 `Ctrl+C` 会停止本次启动的服务。

只准备环境、不启动服务：

```powershell
python run.py --bootstrap-only
```

强制重新配置并编译后端：

```powershell
python run.py --rebuild
```

修改端口或禁止自动打开浏览器：

```powershell
python run.py --port 8081 --ai-port 8093 --no-browser
```

启动器直接调用当前操作系统中的 Python、Git、CMake、Ninja 和 C++ 编译器，不会调用 WSL 的 `bash`。所有下载、项目依赖和构建输出都位于仓库内；启动器不会执行全局 `pip install`，也不会修改系统软件包。

## 环境要求

| 用途 | 需要 |
| --- | --- |
| 打开网页 | 支持 WebGL 2 的 Chrome、Edge 或其他现代浏览器 |
| 运行 `run.py` | Python 3.11–3.14 |
| 获取代码和第三方头文件 | Git |
| 编译后端 | C++17 编译器 |
| 使用模型对话 | 在浏览器中配置模型服务 API Key |

CMake 和 Ninja 由 `run.py` 安装到项目 `.venv`，不需要全局安装。C++ 编译器会依次从 `INTELLIBOT_CXX`、`PATH`、当前 Python 工具链、Conda/MSYS2 和 Visual Studio 安装中自动发现。SQLite3 和 libsodium 会从 Conda、vcpkg、`CMAKE_PREFIX_PATH` 或 C++ 工具链前缀中查找；启动器只会把运行所需的 DLL 复制到 `backend-build/`，不会向这些环境写入内容。

## 首次安装

```powershell
git clone https://github.com/UniqueUpstart/IntelliBot.git
cd IntelliBot
python run.py
```

## 配置 AI 模型

普通本地运行不需要手动创建 `.env` 或 AI 配置文件。

需要 AI 对话时：

1. 页面打开后进入顶部 `Settings → AI 模型`。
2. 也可以点击聊天栏的模型胶囊，再选择“管理 API 与模型”。
3. 选择 DeepSeek、智谱 GLM 或“自定义模型”预设。
4. 填写 API Key；如有需要，再修改接口地址和模型名称。
5. 可以点击模型名称右侧的“获取”读取该服务提供的模型列表。
6. 点击“应用”保存。

第一次在页面中保存后，本机 AI 服务会自动创建 `data/ai_config.json`。因此不需要提前创建文件，也不需要手工编辑它。配置不会写入 Git 或浏览器存储；页面只显示 API Key 的末四位提示。

未配置 Key 时，登录、3D 展示、动作演示和账号状态仍可使用，只有 AI 对话和语音合成不可用。

`.env` 只预留给服务器部署或自动化环境，不是普通本地运行的必要步骤。普通使用不需要执行任何复制 `.env.example` 的命令。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `frontend/` | 页面、样式、3D 机器人、动作数据、对话和交互逻辑 |
| `backend/` | C++17 HTTP 后端、账号认证、用户状态与浏览器动作接口 |
| `backend/ai/` | 本地 AI 与语音服务、浏览器模型配置接口 |
| `assistant/` | AI 动作能力清单 |
| `run.py` | 依赖引导、后端编译和一键启动器 |
| `scripts/` | 兼容脚本与本地运行辅助脚本 |
| `backend/tests/` | 后端接口、认证和会话测试 |
| `docs/` | 项目图片与前端来源说明 |

`backend-build/`、`.venv/`、`third_party/`、`log/`、`data/` 均为项目本地内容，不会提交到 Git。

依赖与运行产物位置：

```text
.venv/                      项目 Python、CMake、Ninja 与 Python 包
third_party/cpp-httplib/    C++ HTTP 头文件
third_party/json/            JSON 头文件
backend-build/              C++ 后端可执行程序及运行所需 DLL
log/                        AI 与后端运行日志
data/ai_config.json         页面保存 AI 配置后自动生成
data/intellibot.db          本地账号和状态数据库
```

## 运行方式

### 一键启动

```powershell
python run.py
```

`run.py` 会优先使用项目内的 `.venv` 和 `backend-build` 中的后端程序。若服务已经在线，它会复用现有服务；若由本次命令启动，`Ctrl+C` 会一并停止。

### 分开启动（开发调试）

先准备项目：

```powershell
python run.py --bootstrap-only
```

分别查看两个进程日志时，可以手动启动：

```powershell
.\.venv\Scripts\python.exe backend\ai\deepseek_bridge.py --port 8091
```

```powershell
.\backend-build\intellibot_backend.exe `
  --port 8080 `
  --web-root frontend `
  --db-path data\intellibot.db `
  --ai-url http://127.0.0.1:8091
```

页面必须通过 <http://127.0.0.1:8080/ui/IntelliBot.html> 打开，不能直接双击 HTML 文件。

### 测试

```powershell
.\.venv\Scripts\ctest.exe --test-dir backend-build --output-on-failure
```

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 首次启动正在安装或编译 | 保持命令窗口打开；首次需要下载依赖并编译后端 |
| 找不到后端程序 | 运行 `python run.py --bootstrap-only` |
| Python 环境曾经有效，现在无法启动 | 直接运行 `python run.py`，启动器会重建失效的 `.venv` |
| 编译提示缺少 SQLite3 或 sodium | 为当前 C++ 编译器准备对应开发库，或通过 `INTELLIBOT_CXX` 指向带有依赖的编译器 |
| 页面显示但 AI 对话不可用 | 打开 `Settings → AI 模型` 填写 API Key；不需要手动创建 AI 配置文件 |
| 找不到 AI 配置文件 | 不需要预先创建；第一次点击“应用”保存后会自动生成 |
| 登录接口不可用 | 确认页面从 `http://127.0.0.1:8080` 打开，且后端正在运行 |
| 3D 模型没有显示 | 确认完整保留了 `frontend/model/` 和 `frontend/lib/three/` |
| 端口被占用 | 执行 `python run.py --port 8081 --ai-port 8093` |
| 直接双击 HTML 无法连接 | 网页必须通过 `http://127.0.0.1:8080` 打开 |
| 曾在 WSL 中执行 `bash` | 在 Windows PowerShell 中运行 `python run.py --rebuild`；启动器不会调用 WSL |

## 可配置项

| 变量 | 作用 |
| --- | --- |
| `PORT` | 后端端口，默认 `8080` |
| `AI_PORT` | AI 服务端口，默认 `8091` |
| `DEPS_MIRROR` | `gitee` 或 `github`，指定第三方头文件的优先下载源 |
| `INTELLIBOT_GIT` | 显式指定 Windows `git.exe` |
| `INTELLIBOT_PYTHON` | 显式指定用于创建 `.venv` 的 Python 3.11–3.14 |
| `INTELLIBOT_CXX` | 显式指定 C++17 编译器 |
| `INTELLIBOT_DEPS_PREFIX` | 显式指定 SQLite3、libsodium 所在的开发库前缀 |

## 动作与 AI 能力

- 首页机器人模型位于 `frontend/model/q1_ff.glb`。
- 浏览器端动作数据位于 `frontend/js/q1_motion_data.js` 与各动作时间线文件。
- AI 可调用的动作、姿态、视角和表情白名单位于 `assistant/capabilities.json`。
- 新增 AI 动作时，需要同步更新前端动作数据与能力清单。

## 设计边界

- 首页机器人是浏览器端实时 3D 动画展示，不连接 ROS 2 或真实机器人设备。
- 后端默认只监听 `127.0.0.1`；公网部署需要 HTTPS、反向代理和部署侧安全配置。
- AI 只返回文本和本地白名单中的动作 ID，动作最终由浏览器校验并播放。
- 对话最多依次执行四个动作，并支持通过文字或界面停止。
- API Key 不进入账号状态，也不会通过配置读取接口返回。
- 当前不提供密码找回、邮箱验证或私人动作库。

接口细节见 [后端说明](backend/README.md)。
