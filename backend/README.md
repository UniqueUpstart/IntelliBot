# IntelliBot 后端

C++17 + cpp-httplib + nlohmann/json；SQLite 保存账号和会话，libsodium 提供 Argon2id 密码哈希。默认只监听 `127.0.0.1`。

## 启动与测试

在仓库根目录执行；Ubuntu依赖：`sudo apt install build-essential cmake pkg-config libcpp-httplib-dev nlohmann-json3-dev libsqlite3-dev libsodium-dev python3`。

```bash
bash scripts/run_web.sh
# 另一个终端：
ctest --test-dir backend-build --output-on-failure
```

打开 http://localhost:8080/ui/experience.html 。默认数据库为 `~/intellibot_ws/data/intellibot.db`；`PORT`、`BUILD_DIR`、`DB_PATH` 可覆盖。直接启动程序时可用 `--port`、`--web-root`、`--db-path` 指定配置。开发模式还支持 `--sim-url` 和 `--ai-url`，分别连接本机 MuJoCo 桥与本地模型服务。

## 接口

统一前缀 `/api/v1`，JSON响应为 `{request_id,data,error}`；失败时 `error` 包含 `code`、`message`。除注册、登录、健康检查外，下列接口需携带 `Authorization: Bearer <token>`，无需 `Idempotency-Key`。

| 方法与路径 | 用途 |
| --- | --- |
| `POST /auth/register` | username、password、可选 display_name；成功201，不自动登录 |
| `POST /auth/login` | username、password；返回 access_token、expires_in、user |
| `GET /auth/me` | 返回当前 user |
| `POST /auth/logout` | 作废当前登录及其页面会话 |
| `GET /browser/actions` | 返回公共动作目录 items |
| `POST /browser/sessions` | 创建独立页面，返回 session_id |
| `GET /browser/sessions/{id}` | 查询该页面最后一次授权动作 |
| `DELETE /browser/sessions/{id}` | 释放页面会话 |
| `POST /browser/sessions/{id}/actions` | 接收 action_id，返回 playback（clip、loop） |
| `GET /ai/config` | 读取当前模型配置（不返回 API Key） |
| `PUT /ai/config` | 更新模型配置；仅允许本机请求 |

用户名3～24位字母、数字或下划线，统一小写；密码8～64位可见ASCII字符，允许空格且不自动裁剪；昵称1～32字符。令牌有效8小时，退出立即失效；数据库仅保存令牌摘要。注册与登录有请求限流。

常见错误：400参数错误、401未登录或凭据错误、404页面会话不存在、409用户名重复、429请求过频。

## 前端接入

登录令牌保存在 `sessionStorage`，401时清理并返回登录页。每次页面加载创建新的 session_id，不共享页面会话；每个登录最多保留20个页面会话，可主动DELETE释放。

动作请求示例：`{"action_id":"raise_hand"}`。后端只授权并返回动画信息（status=authorized、robot_executed=false），浏览器调用 `window.robot3d.playClip(clip,loop)`；`robot-playback` 事件报告 playing/completed。后端查询结果不是实际播放进度。

## 开发模式与限制

`--legacy-dev` 保留原共享 mock / MuJoCo 接口，关闭认证，业务写请求仍需 Idempotency-Key。仿真启动脚本已使用该参数，仅供本机开发；普通网页模式禁止调用共享控制接口。

开发模式提供 `POST /api/v1/chat`：请求包含 `message`、最多 10 条 `history`，以及可选的 `persona` 角色设定（最多 1200 字），返回 `reply`、兼容单动作的 `action_id`、最多四项的 `actions`、`stop` 与模型名。`persona` 由浏览器本地保存并随当前请求转发，不会写入模型配置。模型配置通过 `GET/PUT /api/v1/ai/config` 同步到本机 AI 服务；API Key 不会通过 GET 返回，也不保存在浏览器。

当前无找回密码、邮箱验证或私人动作库。公网部署需HTTPS及部署配置。

自动测试覆盖API、仿真适配、认证持久化与会话隔离。可选浏览器验收：安装Playwright及Chromium后，运行 `python backend/tests/browser_test.py <后端程序绝对路径>`。
