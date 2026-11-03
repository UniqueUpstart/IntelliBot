# IntelliBot

IntelliBot 是一个基于 MuJoCo 的机器人仿真与 AI 交互界面。你可以在浏览器里观察机器人，操作关节、姿态、手势和移动，也可以通过 C++ 后端把控制命令转发给独立的 MuJoCo 仿真进程。

> 第一次接触这个项目时，建议直接按照下面的「Windows 从零开始」完整执行一次。仓库不会提交个人虚拟环境、编译产物、第三方依赖和机器人模型，因此“克隆下来就能运行”之前还需要完成一次准备。

如果这台电脑已经完成过一次准备，并且项目里已经有 `.venv`、`third_party/`、`sim/assets/q1-urdf/` 和 `backend-build/intellibot_backend.exe`，可以直接在项目根目录运行：

```powershell
.\scripts\run_sim_stack.cmd
```

## 项目能做什么

- 在浏览器中查看 MuJoCo 渲染的 Q1 机器人画面。
- 拖动滑块控制关节，切换站姿、挥手、敬礼、跳舞等动作。
- 控制底盘前后左右移动、转向、行走和踏步。
- 通过 C++ 后端校验参数并转发到仿真桥，避免前端直接操作仿真内部。
- 在独立的体验页中使用账号登录，并体验浏览器端动作授权和页面会话隔离。

当前项目只连接本地 MuJoCo 仿真，不连接 ROS 2 或真实机器人。

## 项目目录

```text
frontend/            网页、样式、前端控制和 3D 机器人资源
backend/             C++17 HTTP 后端、认证与业务接口
sim/                 MuJoCo 仿真桥和动作库
scripts/             环境准备、构建、启动与验收脚本
backend/tests/        后端接口和认证测试
sim/tests/            仿真动作库与关节控制测试
docs/                 接口草案、仿真联调和需求说明
third_party/          后端第三方头文件（本地下载，不提交）
sim/assets/q1-urdf/   Q1 机器人模型（本地下载，不提交）
```

`backend-build/`、`.venv/`、`third_party/` 和 `sim/assets/q1-urdf/` 都是本机生成或下载的内容，被 `.gitignore` 忽略，所以 GitHub 仓库里看不到它们是正常的。

## Windows 从零开始

下面以 Windows 10/11 64 位、PowerShell 和默认端口为例。第一次安装会比较久，但每一步完成后都会留下可复用的环境。

### 0. 先检查项目路径

请把项目放在**全英文、不含空格**的目录中，例如：

```text
C:\dev\IntelliBot
```

MuJoCo 遇到部分中文路径时可能无法加载模型，而且报错信息不一定直接指出路径问题。推荐使用 `C:\dev`，不要放在桌面中文用户名目录下的深层路径里。

### 1. 安装必需软件

需要准备以下软件：

| 软件 | 要求 | 用途 |
| --- | --- | --- |
| [Git for Windows](https://git-scm.com/downloads/win) | 2.x 或更新版本 | 克隆代码、下载模型，并提供 Git Bash |
| [Python](https://www.python.org/downloads/windows/) | 64 位 Python 3.11 或 3.12，建议勾选加入 PATH | 创建项目虚拟环境、运行仿真桥 |
| [Visual Studio](https://visualstudio.microsoft.com/downloads/) | Visual Studio 2022，安装“使用 C++ 的桌面开发”和 Windows SDK | 编译 C++ 后端；自带 CMake 和 Ninja |
| [Miniconda](https://docs.conda.io/projects/miniconda/en/latest/) 或 Anaconda | 可使用默认安装位置 | 提供后端需要的 SQLite 和 libsodium 编译库 |

安装完成后打开一个新的 PowerShell，确认 Git、Python 和 Conda 能被找到：

```powershell
git --version
py -0p
conda --version
```

如果没有列出 Python 3.11/3.12，可以重新运行 Python 安装程序补装，或者在后面的命令中把 `py -3.12` 换成你实际安装的版本。

### 2. 获取项目代码

```powershell
New-Item -ItemType Directory -Force C:\dev | Out-Null
Set-Location C:\dev
git clone https://github.com/UniqueUpstart/IntelliBot.git
Set-Location C:\dev\IntelliBot
```

后续命令都在项目根目录中执行。

### 3. 创建 Python 虚拟环境

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r sim\requirements.txt
```

如果本机安装的是 Python 3.11，把第一行改成：

```powershell
py -3.11 -m venv .venv
```

本文后面的命令直接使用 `.venv\Scripts\python.exe`，所以不需要每次先执行 `Activate.ps1`。这样也能避免“明明装了 MuJoCo，运行时却用了另一个 Python”的问题。

### 4. 安装后端所需的 Windows 编译库

在 PowerShell 中执行：

```powershell
conda install -n base -c conda-forge sqlite libsodium -y
```

如果构建脚本找不到 Conda 的库目录，可以先找到 Conda 根目录，再显式告诉构建脚本：

```powershell
conda info --base
$env:INTELLIBOT_DEPS_PREFIX = "把上一行输出的路径替换到这里\Library"
```

例如输出是 `C:\Users\你的用户名\miniconda3`，那么变量应设为：

```powershell
$env:INTELLIBOT_DEPS_PREFIX = "C:\Users\你的用户名\miniconda3\Library"
```

### 5. 下载后端依赖和机器人模型

这两个下载脚本使用 `bash`。在 Windows 上最稳妥的方式是通过 Git for Windows 自带的 Git Bash 运行：

```powershell
& "$env:ProgramFiles\Git\bin\bash.exe" scripts/fetch_deps.sh
& "$env:ProgramFiles\Git\bin\bash.exe" scripts/fetch_model.sh
```

如果 Git 安装在自定义目录，也可以从开始菜单打开 Git Bash，进入项目目录后执行：

```bash
cd /c/dev/IntelliBot
bash scripts/fetch_deps.sh
bash scripts/fetch_model.sh
```

确认以下文件已经出现：

```text
third_party/cpp-httplib/httplib.h
third_party/json/single_include/nlohmann/json.hpp
sim/assets/q1-urdf/xml/q1_v3_mc.xml
```

机器人模型及其网格文件约有几十 MB。下载失败时，先检查网络或代理，再重新执行失败的脚本即可。

### 6. 编译 C++ 后端

```powershell
& "$env:ProgramFiles\Git\bin\bash.exe" scripts/build_backend.sh
```

成功后会生成：

```text
backend-build/intellibot_backend.exe
```

Windows 构建脚本会自动寻找 Visual Studio 自带的 CMake 和 Ninja，不需要另外安装它们。

### 7. 启动完整仿真

最简单的方式是双击：

```text
scripts\run_sim_stack.cmd
```

也可以在 PowerShell 中执行：

```powershell
.\scripts\run_sim_stack.cmd
```

这个脚本会先启动 `8090` 端口的 MuJoCo 仿真桥，确认它可用后，再启动 `8080` 端口的后端。看到下面类似的提示就表示启动成功：

```text
SIM MODE: http://127.0.0.1:8080 -> mujoco bridge 127.0.0.1:8090
```

浏览器打开：

<http://127.0.0.1:8080/ui/IntelliBot.html>

然后在页面顶栏打开 `Advance`，点击「连接仿真」。连接成功后可以打开左侧画面、拖动关节、切换姿态或动作。

### 8. 确认服务是否正常

可以另开一个 PowerShell，检查后端和仿真桥：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
Invoke-RestMethod http://127.0.0.1:8090/health
```

也可以运行项目自带的链路验收脚本：

```powershell
.\.venv\Scripts\python.exe scripts\verify_sim_chain.py
```

脚本会逐项检查健康状态、连接、关节、手势、底盘移动、急停、相机和模式切换，并打印 `PASS` 或 `FAIL`。

## 分开启动仿真

如果希望分别观察两个进程的日志，可以打开两个 PowerShell，并都把当前目录切到项目根目录。

**终端 1：MuJoCo 仿真桥（8090）**

```powershell
.\.venv\Scripts\python.exe sim\mujoco_bridge.py --port 8090 --headless
```

`--headless` 表示不弹 MuJoCo 原生窗口，画面由仿真桥离屏渲染后提供给网页。

**终端 2：C++ 后端（8080）**

```powershell
.\backend-build\intellibot_backend.exe `
  --legacy-dev `
  --port 8080 `
  --web-root frontend `
  --sim-url http://127.0.0.1:8090
```

仍然打开 <http://127.0.0.1:8080/ui/IntelliBot.html>，再点击「连接仿真」。

`--legacy-dev` 是本机演示用的共享控制模式，不要求登录。完整账号功能使用的页面和接口不同，见下面的「账号体验页」。

## 其他常用运行方式

### 只启动后端，不接仿真

仿真桥不启动时，后端仍能打开静态页面，但关节和动作接口会明确返回“未启用仿真”，不会伪装成执行成功。

```powershell
.\backend-build\intellibot_backend.exe `
  --legacy-dev `
  --port 8080 `
  --web-root frontend
```

### 使用 MuJoCo 原生窗口

先关闭正在运行的整套服务，再执行：

```powershell
$env:SIM_MODE = "viewer"
.\scripts\run_sim_stack.cmd
```

原生窗口模式会把 MuJoCo 画面显示在独立窗口中，网页不再提供实时机器人画面，只显示状态和控制项。结束本次运行后，可以用下面的命令恢复默认模式：

```powershell
Remove-Item Env:SIM_MODE -ErrorAction SilentlyContinue
```

### 修改默认端口

PowerShell 中先设置环境变量再启动：

```powershell
$env:PORT = "8081"
$env:SIM_PORT = "8091"
.\scripts\run_sim_stack.cmd
```

启动后访问 `http://127.0.0.1:8081/ui/IntelliBot.html`。需要恢复默认端口时，删除这两个临时环境变量即可：

```powershell
Remove-Item Env:PORT,Env:SIM_PORT -ErrorAction SilentlyContinue
```

### 账号体验页

账号、登录和独立浏览器页面会话由 C++ 后端的完整 Web 模式提供。先运行后端：

```powershell
.\backend-build\intellibot_backend.exe `
  --port 8080 `
  --web-root frontend `
  --db-path data\intellibot.db
```

然后打开：

<http://127.0.0.1:8080/ui/experience.html>

首次使用时可以直接注册账号。账号数据保存在 `data/intellibot.db`，该文件不会提交到 Git。

账号体验页与 `IntelliBot.html` 的仿真控制页是两套演示入口：前者演示登录、权限边界和浏览器动作，后者演示浏览器中的 MuJoCo 机器人控制。

## 重新编译和测试

前端 HTML/CSS/JS、仿真 Python 代码和模型文件修改后通常不需要重新编译后端。只有修改了 `backend/src/`、`backend/include/` 或 `backend/CMakeLists.txt` 时才需要重新构建。

### 重新构建后端

PowerShell：

```powershell
& "$env:ProgramFiles\Git\bin\bash.exe" scripts/build_backend.sh
```

Git Bash：

```bash
bash scripts/build_backend.sh
```

### 运行测试

后端已经编译完成时，可以分别运行接口测试和认证测试：

```powershell
.\.venv\Scripts\python.exe backend\tests\api_test.py .\backend-build\intellibot_backend.exe
.\.venv\Scripts\python.exe backend\tests\auth_test.py .\backend-build\intellibot_backend.exe
```

仿真侧测试：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s sim\tests -v
```

如果测试需要连接正在运行的仿真，请先启动完整仿真链，再运行链路验收脚本。

## Ubuntu / WSL 从零开始

Ubuntu 22.04、24.04 或更新版本可以使用下面的流程。WSL 用户建议把项目放在 WSL 自己的 Linux 文件系统中，而不是带中文路径的 `/mnt/c/...` 下。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y \
  git build-essential cmake pkg-config curl \
  python3 python3-venv python3-pip \
  libcpp-httplib-dev nlohmann-json3-dev \
  libsqlite3-dev libsodium-dev \
  libgl1 libglib2.0-0 libegl1
```

### 2. 获取项目并创建 Python 环境

```bash
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/UniqueUpstart/IntelliBot.git
cd IntelliBot

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r sim/requirements.txt
```

### 3. 下载模型并编译后端

系统包已经提供 cpp-httplib 和 nlohmann/json，但运行 `fetch_deps.sh` 会自动判断并跳过已有依赖，保持和 Windows 流程一致也没有问题：

```bash
bash scripts/fetch_deps.sh
bash scripts/fetch_model.sh
bash scripts/build_backend.sh
```

生成的后端路径是：

```text
backend-build/intellibot_backend
```

### 4. 启动完整仿真

```bash
bash scripts/run_sim_stack.sh
```

浏览器打开 <http://127.0.0.1:8080/ui/IntelliBot.html>，再点击「连接仿真」。

在 WSL 中使用原生 MuJoCo 窗口需要 WSLg（Windows 11 通常自带）。如果只想通过网页看图，保持默认的 `--headless` 即可，不需要额外配置显示器。

## 常见问题

### 提示找不到 `python`、`mujoco` 或 `numpy`

这通常是命令使用了系统 Python，而不是项目的 `.venv`。优先使用完整路径：

```powershell
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -c "import mujoco, numpy, PIL; print('Python dependencies OK')"
```

如果虚拟环境创建时所用的 Python 已被卸载或移动，删除并重新创建 `.venv`，然后重新执行第 3 步即可。

### 编译时提示缺少 `httplib.h` 或 `nlohmann/json.hpp`

执行：

```powershell
& "$env:ProgramFiles\Git\bin\bash.exe" scripts/fetch_deps.sh
```

### 编译时提示找不到 SQLite3 或 sodium

确认 Conda 已经安装两个库：

```powershell
conda install -n base -c conda-forge sqlite libsodium -y
```

然后重新运行构建脚本。如果仍然失败，按第 4 步设置 `INTELLIBOT_DEPS_PREFIX`，指向 Conda 根目录下的 `Library` 文件夹。

### 启动时提示模型不存在

执行：

```powershell
& "$env:ProgramFiles\Git\bin\bash.exe" scripts/fetch_model.sh
```

模型必须保留 `xml/` 和 `meshes/` 的相对目录结构。如果模型路径中包含中文，请把整个项目移动到纯英文目录后重试。

### 页面提示 `502 SIM_UNAVAILABLE`

说明浏览器和后端已经启动，但 `8090` 的 MuJoCo 仿真桥没有运行或没有启动完成。先检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8090/health
```

如果连接失败，回到仿真桥终端查看报错；如果使用了自定义端口，确认后端的 `--sim-url` 与桥的 `--port` 一致。

### 页面有数值但没有机器人画面

常见原因是仿真桥运行在原生窗口模式，或者离屏渲染后端不可用。确认仿真桥命令中有 `--headless`；WSL 中遇到 GL 错误时，可以依次尝试：

```bash
MUJOCO_GL=egl .venv/bin/python sim/mujoco_bridge.py --port 8090 --headless
MUJOCO_GL=osmesa .venv/bin/python sim/mujoco_bridge.py --port 8090 --headless
```

Windows 原生运行通常不需要设置 `MUJOCO_GL`，设置了反而可能产生新的 GL 错误。

### 端口已被占用

先查看占用 `8080`、`8090` 的进程：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8080,8090 |
  Select-Object LocalPort,OwningProcess
```

确认对应程序可以关闭后，按 PID 结束：

```powershell
Stop-Process -Id <PID>
```

也可以改用其他端口，具体命令见「修改默认端口」。

### 浏览器从 `file://` 打开页面时请求失败

页面必须通过后端地址打开，不要直接双击 HTML 文件。请访问：

<http://127.0.0.1:8080/ui/IntelliBot.html>

## 关闭服务

使用 `run_sim_stack.cmd` 时，在运行它的窗口中按一次 `Ctrl+C`。脚本会同时收掉仿真桥和后端，避免端口残留。

如果是按「分开启动仿真」的方式开了两个终端，建议先在后端终端按 `Ctrl+C`，再到仿真桥终端按一次 `Ctrl+C`。

## 配置与边界

- `frontend/` 只能通过后端访问，后端默认只监听 `127.0.0.1`。
- `8090` 是 MuJoCo 仿真桥，`8080` 是 C++ 后端和网页入口。
- 不传 `--sim-url` 时，后端处于纯 mock 模式，仿真控制接口会返回 422。
- 仿真桥不可用时，后端返回 502，不会把未执行的命令报告为成功。
- `--legacy-dev` 用于本机仿真演示，会关闭账号认证；不要把该模式暴露到局域网或公网。
- 当前不包含 ROS 2、真机连接、找回密码、邮箱验证、私人动作库或大模型对话。
- 更多接口与联调细节见 [docs/仿真联调.md](docs/仿真联调.md)，后端认证和会话接口见 [backend/README.md](backend/README.md)。
