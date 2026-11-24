#!/usr/bin/env python3
"""Prepare and start IntelliBot with one cross-platform command.

The first run creates a project-local virtual environment, installs project
dependencies there, downloads the C++ headers, builds the backend inside the
repository, and then starts both services.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
AI_REQUIREMENTS = ROOT / "backend" / "ai" / "requirements.txt"
THIRD_PARTY = ROOT / "third_party"
BUILD_DIR = ROOT / "backend-build"
LOG_DIR = ROOT / "log"
REQUIREMENTS_STAMP = VENV / ".intellibot-requirements.sha256"

DEPENDENCIES = (
    {
        "name": "cpp-httplib",
        "dest": THIRD_PARTY / "cpp-httplib",
        "marker": Path("httplib.h"),
        "gitee": "https://gitee.com/mirrors_yhirose/cpp-httplib.git",
        "github": "https://github.com/yhirose/cpp-httplib.git",
    },
    {
        "name": "nlohmann/json",
        "dest": THIRD_PARTY / "json",
        "marker": Path("single_include") / "nlohmann" / "json.hpp",
        "gitee": "https://gitee.com/mirrors/nlohmann-json.git",
        "github": "https://github.com/nlohmann/json.git",
    },
)


class BootstrapError(RuntimeError):
    """A recoverable project setup error."""


def log(message: str) -> None:
    print(message, flush=True)


def running_in_wsl() -> bool:
    if os.name == "nt":
        return False
    if os.environ.get("WSL_DISTRO_NAME"):
        return True
    proc_version = Path("/proc/version")
    if not proc_version.is_file():
        return False
    return "microsoft" in proc_version.read_text(errors="ignore").lower()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare and start IntelliBot")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8080")),
        help="backend port (default: PORT or 8080)",
    )
    parser.add_argument(
        "--ai-port",
        type=int,
        default=int(os.environ.get("AI_PORT", "8091")),
        help="AI service port (default: AI_PORT or 8091)",
    )
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    parser.add_argument(
        "--bootstrap-only",
        action="store_true",
        help="prepare the Python environment and backend without starting services",
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="reconfigure and rebuild the C++ backend",
    )
    return parser.parse_args()


def run_checked(
    args: Sequence[str | Path],
    *,
    description: str,
    cwd: Path = ROOT,
    env: dict[str, str] | None = None,
) -> None:
    log(f"==> {description}")
    completed = subprocess.run(
        [str(item) for item in args],
        cwd=str(cwd),
        env=env,
    )
    if completed.returncode != 0:
        raise BootstrapError(f"{description}失败（退出码 {completed.returncode}）")


def probe(
    args: Sequence[str | Path],
    *,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(item) for item in args],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
    )


def venv_bin_dir() -> Path:
    for name in ("Scripts", "bin"):
        candidate = VENV / name
        if candidate.is_dir():
            return candidate
    raise BootstrapError("项目虚拟环境已损坏：找不到 Scripts 或 bin 目录")


def venv_python() -> Path:
    candidates = (
        VENV / "Scripts" / "python.exe",
        VENV / "bin" / "python.exe",
        VENV / "bin" / "python",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise BootstrapError("项目虚拟环境已损坏：找不到 .venv 中的 Python")


def python_environment_ready() -> bool:
    if not VENV.is_dir():
        return False
    try:
        python = venv_python()
    except BootstrapError:
        return False
    result = probe([python, "-c", "import edge_tts, sys; print(sys.version)"])
    if result.returncode != 0:
        return False
    try:
        bin_dir = venv_bin_dir()
    except BootstrapError:
        return False
    has_cmake = any((bin_dir / name).is_file() for name in ("cmake.exe", "cmake"))
    has_ninja = any((bin_dir / name).is_file() for name in ("ninja.exe", "ninja"))
    return has_cmake and has_ninja


def requirements_digest() -> str:
    digest = hashlib.sha256()
    for path in (REQUIREMENTS, AI_REQUIREMENTS):
        digest.update(path.read_bytes())
    return digest.hexdigest()


def python_candidates() -> list[Path]:
    candidates: list[Path] = []
    for value in (
        os.environ.get("INTELLIBOT_PYTHON"),
        getattr(sys, "_base_executable", None),
        sys.executable,
    ):
        if value:
            candidates.append(Path(value))

    names = ("python.exe", "python") if os.name == "nt" else ("python3", "python")
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if not directory:
            continue
        candidates.extend(Path(directory) / name for name in names)

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        python_root = Path(local_app_data) / "Programs" / "Python"
        if python_root.is_dir():
            candidates.extend(sorted(python_root.glob("Python*/python.exe"), reverse=True))

    if os.name != "nt":
        candidates.extend((Path("/usr/bin/python3"), Path("/usr/local/bin/python3")))

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = os.path.normcase(os.path.abspath(candidate))
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def select_base_python() -> Path:
    for candidate in python_candidates():
        if not candidate.is_file():
            continue
        result = probe(
            [
                candidate,
                "-c",
                "import json, sys; print(json.dumps(sys.version_info[:3]))",
            ]
        )
        if result.returncode != 0:
            continue
        try:
            version = tuple(json.loads(result.stdout.strip().splitlines()[-1]))
        except (ValueError, IndexError, json.JSONDecodeError):
            continue
        if (3, 11) <= version < (3, 15):
            log(f"==> Python 解释器：{candidate} ({'.'.join(map(str, version))})")
            return candidate
    raise BootstrapError(
        "找不到可用的 Python 3.11–3.14。请通过 INTELLIBOT_PYTHON "
        "指定可执行的 Python；项目不会启动无效的 .venv 解释器"
    )


def ensure_python_environment() -> Path:
    if VENV.exists() and not python_environment_ready():
        log("==> 项目虚拟环境不完整或绑定了失效的 Python，正在重建 .venv")
        shutil.rmtree(VENV)

    if not VENV.exists():
        base_python = select_base_python()
        run_checked(
            [base_python, "-m", "venv", VENV],
            description=f"创建项目虚拟环境 {VENV}",
        )

    python = venv_python()
    digest = requirements_digest()
    installed_digest = (
        REQUIREMENTS_STAMP.read_text(encoding="utf-8").strip()
        if REQUIREMENTS_STAMP.is_file()
        else ""
    )
    if installed_digest != digest or not python_environment_ready():
        pip_env = {
            **os.environ,
            "PIP_REQUIRE_VIRTUALENV": "1",
            "PIP_NO_INPUT": "1",
            "PYTHONNOUSERSITE": "1",
        }
        run_checked(
            [
                python,
                "-m",
                "pip",
                "install",
                "--no-cache-dir",
                "--disable-pip-version-check",
                "-r",
                REQUIREMENTS,
            ],
            description="安装项目内 Python、CMake 与 Ninja 依赖",
            env=pip_env,
        )
        REQUIREMENTS_STAMP.write_text(digest + "\n", encoding="utf-8")

    log(f"==> Python 环境：{python}")
    return python


def find_git() -> Path:
    configured = os.environ.get("INTELLIBOT_GIT")
    candidates = [configured, shutil.which("git")]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        if path.is_file():
            return path
    raise BootstrapError("找不到 Git。请安装 Git for Windows，并确保 git.exe 可用")


def clone_with_fallback(name: str, dest: Path, gitee: str, github: str) -> None:
    git = find_git()
    mirror = os.environ.get("DEPS_MIRROR", "gitee").lower()
    urls = [github, gitee] if mirror == "github" else [gitee, github]
    temporary = dest.with_name(dest.name + ".bootstrap")
    if temporary.exists():
        shutil.rmtree(temporary)
    dest.parent.mkdir(parents=True, exist_ok=True)

    last_error: BootstrapError | None = None
    for url in urls:
        try:
            run_checked(
                [git, "clone", "--depth", "1", url, temporary],
                description=f"下载 {name} 到项目 third_party",
            )
            temporary.replace(dest)
            return
        except BootstrapError as error:
            last_error = error
            if temporary.exists():
                shutil.rmtree(temporary)
            log(f"    {name} 镜像下载失败，尝试备用地址")
    raise BootstrapError(f"无法下载 {name}：{last_error}")


def ensure_third_party() -> None:
    missing = [
        dependency
        for dependency in DEPENDENCIES
        if not (dependency["dest"] / dependency["marker"]).is_file()
    ]
    if not missing:
        return
    if not THIRD_PARTY.exists():
        THIRD_PARTY.mkdir(parents=True)

    for dependency in missing:
        dest = dependency["dest"]
        if dest.exists():
            log(f"==> 移除不完整的项目依赖 {dest}")
            shutil.rmtree(dest)
        clone_with_fallback(
            dependency["name"],
            dest,
            dependency["gitee"],
            dependency["github"],
        )


def find_windows_compiler() -> tuple[Path, Path]:
    configured = os.environ.get("INTELLIBOT_CXX")
    candidates = [Path(configured)] if configured else []
    for name in ("g++.exe", "clang++.exe"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    roots = []
    python_prefix = Path(sys.executable).resolve().parent.parent
    roots.extend(
        [
            Path(os.environ.get("MSYSTEM_PREFIX", "")),
            python_prefix,
            Path("C:/msys64/ucrt64"),
            Path("C:/msys64/mingw64"),
        ]
    )
    for root in roots:
        if not str(root):
            continue
        candidates.extend((root / "bin" / "g++.exe", root / "bin" / "clang++.exe"))

    for candidate in candidates:
        if candidate.is_file():
            prefix = candidate.parent.parent
            if not (prefix / "include").is_dir():
                continue
            return candidate.resolve(), prefix.resolve()
    raise BootstrapError(
        "找不到 Windows C++17 编译器。请提供 g++/clang++，"
        "或通过 INTELLIBOT_CXX 指向编译器；启动器不会修改全局环境"
    )


def find_unix_compiler() -> tuple[Path, Path]:
    configured = os.environ.get("INTELLIBOT_CXX")
    candidates = [configured] if configured else []
    candidates.extend(shutil.which(name) for name in ("c++", "g++", "clang++"))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            compiler = Path(candidate).resolve()
            return compiler, compiler.parent.parent
    raise BootstrapError("找不到 C++17 编译器，请先准备 c++、g++ 或 clang++")


def find_build_tools() -> tuple[Path, Path]:
    bin_dir = venv_bin_dir()
    cmake = next(
        (bin_dir / name for name in ("cmake.exe", "cmake") if (bin_dir / name).is_file()),
        None,
    )
    ninja = next(
        (bin_dir / name for name in ("ninja.exe", "ninja") if (bin_dir / name).is_file()),
        None,
    )
    if cmake is None or ninja is None:
        raise BootstrapError("项目内缺少 CMake 或 Ninja，请重新运行 python run.py")
    return cmake, ninja


def build_environment(prefix: Path) -> dict[str, str]:
    env = {**os.environ, "PYTHONNOUSERSITE": "1"}
    prepend = [
        venv_bin_dir(),
        prefix / "bin",
    ]
    env["PATH"] = os.pathsep.join(
        [str(path) for path in prepend] + [env.get("PATH", "")]
    )
    return env


def build_config_fingerprint(
    python: Path,
    compiler: Path,
    prefix: Path,
    cmake: Path,
    ninja: Path,
) -> str:
    payload = "\n".join(
        [
            str(python.resolve()),
            str(VENV / "pyvenv.cfg"),
            (VENV / "pyvenv.cfg").read_text(encoding="utf-8", errors="replace"),
            str(compiler.resolve()),
            str(prefix.resolve()),
            str(cmake.resolve()),
            str(ninja.resolve()),
            requirements_digest(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def copy_runtime_dependencies(executable: Path, compiler: Path, prefix: Path) -> None:
    if os.name != "nt":
        return
    objdump = compiler.with_name("objdump.exe")
    if not objdump.is_file():
        return

    pending = [executable]
    visited: set[Path] = set()
    search_dirs = [
        executable.parent,
        prefix / "bin",
        compiler.parent,
        venv_bin_dir(),
    ]
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        result = probe([objdump, "-p", current])
        if result.returncode != 0:
            continue
        for line in result.stdout.splitlines():
            marker = "DLL Name:"
            if marker not in line:
                continue
            dll_name = line.split(marker, 1)[1].strip()
            source = next(
                (
                    directory / dll_name
                    for directory in search_dirs
                    if (directory / dll_name).is_file()
                ),
                None,
            )
            if source is None:
                continue
            copied = executable.parent / dll_name
            if not copied.exists():
                shutil.copy2(source, copied)
                pending.append(copied)


def backend_executable() -> Path:
    candidates = (
        BUILD_DIR / "intellibot_backend.exe",
        BUILD_DIR / "intellibot_backend",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise BootstrapError("后端编译完成，但没有找到 backend-build 中的可执行程序")


def ensure_backend(*, rebuild: bool) -> Path:
    ensure_third_party()
    cmake, ninja = find_build_tools()
    compiler, prefix = (
        find_windows_compiler() if os.name == "nt" else find_unix_compiler()
    )
    env = build_environment(prefix)
    cache = BUILD_DIR / "CMakeCache.txt"
    config_stamp = BUILD_DIR / ".intellibot-config.sha256"
    fingerprint = build_config_fingerprint(
        venv_python(),
        compiler,
        prefix,
        cmake,
        ninja,
    )
    configured_fingerprint = (
        config_stamp.read_text(encoding="utf-8").strip()
        if config_stamp.is_file()
        else ""
    )

    if rebuild or not cache.is_file() or configured_fingerprint != fingerprint:
        configure = [
            cmake,
            "--fresh",
            "-S",
            ROOT / "backend",
            "-B",
            BUILD_DIR,
            "-G",
            "Ninja",
            "-DCMAKE_BUILD_TYPE=Release",
            f"-DCMAKE_MAKE_PROGRAM={ninja}",
            f"-DCMAKE_CXX_COMPILER={compiler}",
            f"-DCMAKE_PREFIX_PATH={prefix}",
            f"-DPython3_EXECUTABLE={venv_python()}",
        ]
        run_checked(configure, description="配置项目内 C++ 后端", env=env)
        config_stamp.write_text(fingerprint + "\n", encoding="utf-8")

    run_checked(
        [cmake, "--build", BUILD_DIR],
        description="编译项目内 C++ 后端",
        env=env,
    )
    executable = backend_executable()
    copy_runtime_dependencies(executable, compiler, prefix)
    log(f"==> 后端程序：{executable}")
    return executable


def start_process(args: list[str], *, log_path: Path | None = None) -> subprocess.Popen:
    stdout = subprocess.PIPE
    stderr = subprocess.STDOUT
    log_file = None
    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("w", encoding="utf-8")
        stdout = log_file
    process = subprocess.Popen(
        args,
        cwd=ROOT,
        stdout=stdout,
        stderr=stderr,
        text=True,
        bufsize=1,
        env={
            **os.environ,
            "PYTHONUNBUFFERED": "1",
            "PYTHONNOUSERSITE": "1",
        },
    )
    process._intellibot_log_file = log_file  # type: ignore[attr-defined]
    return process


def health(url: str, validator) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return validator(json.load(response))
    except (OSError, ValueError, urllib.error.URLError):
        return False


def wait_until_ready(
    process: subprocess.Popen,
    url: str,
    validator,
    timeout_seconds: float = 20.0,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"process exited with code {process.returncode}")
        if health(url, validator):
            return
        time.sleep(0.25)
    raise TimeoutError(f"service did not become ready: {url}")


def stop_process(process: subprocess.Popen | None) -> None:
    if process is None:
        return
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    log_file = getattr(process, "_intellibot_log_file", None)
    if log_file is not None:
        log_file.close()


def show_log(path: Path) -> None:
    if not path.is_file():
        return
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if lines:
        print(f"\nLast lines from {path}:")
        print("\n".join(lines[-20:]))


def main() -> int:
    args = parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.ai_port <= 65535:
        raise ValueError("ports must be between 1 and 65535")
    if args.port == args.ai_port:
        raise ValueError("--port and --ai-port must be different")

    try:
        if running_in_wsl():
            raise BootstrapError(
                "检测到 WSL 环境。请关闭 WSL，在 Windows PowerShell 中运行 python run.py，"
                "以免生成 Linux 后端程序"
            )
        python = ensure_python_environment()
        backend = ensure_backend(rebuild=args.rebuild)
    except BootstrapError as error:
        print(f"\n准备失败：{error}", file=sys.stderr)
        return 1

    if args.bootstrap_only:
        print("\nIntelliBot 已准备完成，可以直接运行：python run.py")
        return 0

    ai_script = ROOT / "backend" / "ai" / "deepseek_bridge.py"
    frontend = ROOT / "frontend"
    database = ROOT / "data" / "intellibot.db"
    if not ai_script.is_file():
        raise FileNotFoundError(f"AI service not found: {ai_script}")
    if not frontend.is_dir():
        raise FileNotFoundError(f"frontend directory not found: {frontend}")
    database.parent.mkdir(parents=True, exist_ok=True)

    backend_url = f"http://127.0.0.1:{args.port}"
    ai_url = f"http://127.0.0.1:{args.ai_port}"
    page_url = f"{backend_url}/ui/IntelliBot.html"
    ai_log = LOG_DIR / "ai.log"
    ai_process: subprocess.Popen | None = None
    backend_process: subprocess.Popen | None = None

    try:
        ai_ready = health(f"{ai_url}/health", lambda value: bool(value.get("ok")))
        if not ai_ready:
            print("Starting AI service...")
            ai_process = start_process(
                [str(python), str(ai_script), "--port", str(args.ai_port)],
                log_path=ai_log,
            )
            try:
                wait_until_ready(
                    ai_process,
                    f"{ai_url}/health",
                    lambda value: bool(value.get("ok")),
                )
            except Exception:
                show_log(ai_log)
                raise
        else:
            print(f"Using AI service at {ai_url}")

        backend_ready = health(
            f"{backend_url}/api/v1/health",
            lambda value: value.get("data", {}).get("service") == "intellibot_backend",
        )
        if not backend_ready:
            print("Starting backend...")
            backend_process = start_process(
                [
                    str(backend),
                    "--port",
                    str(args.port),
                    "--web-root",
                    str(frontend),
                    "--db-path",
                    str(database),
                    "--ai-url",
                    ai_url,
                ],
                log_path=LOG_DIR / "backend.log",
            )
            try:
                wait_until_ready(
                    backend_process,
                    f"{backend_url}/api/v1/health",
                    lambda value: value.get("data", {}).get("service")
                    == "intellibot_backend",
                )
            except Exception:
                show_log(LOG_DIR / "backend.log")
                raise
        else:
            print(f"Using backend at {backend_url}")

        print(f"\nIntelliBot is ready: {page_url}")
        if not args.no_browser:
            webbrowser.open(page_url)

        if ai_process is None and backend_process is None:
            return 0

        print("Press Ctrl+C to stop the services started by this command.")
        while True:
            for name, process in (
                ("backend", backend_process),
                ("AI service", ai_process),
            ):
                if process is not None and process.poll() is not None:
                    raise RuntimeError(
                        f"{name} stopped with code {process.returncode}"
                    )
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping IntelliBot...")
        return 0
    except Exception as error:
        print(f"\nStartup failed: {error}", file=sys.stderr)
        return 1
    finally:
        stop_process(backend_process)
        stop_process(ai_process)


if __name__ == "__main__":
    raise SystemExit(main())
