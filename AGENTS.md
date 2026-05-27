# Repository Guidelines

## 项目结构与模块组织
- 主流程集中在 `src/weread-challenge.js`，覆盖 login flow、reading loop、通知推送等职责；文件内部按函数块划分，后续可按场景拆分成 modules。
- `.weread/` 是默认数据目录，首次运行时生成 cookies.json、login.png、output.log 与截图；如需旧版 `data/`，必须显式设置 `WEREAD_DATA_DIR=./data`。
- `docker-compose.yml`、`Dockerfile` 负责 orchestrate Selenium standalone chrome，`README-dev.md` 概述 VS Code 调试；若需要自定义 remote browser，请在 compose 文件中调整 service name 与 network。

## 构建、测试与开发命令
- `npm install`：安装 `selenium-webdriver` 等运行依赖，建议为每次依赖升级记录 package-lock 差异。
- `npm run start`：使用示例远程 Selenium 地址和 `DEFAULT_BOOK_URL` 执行脚本；若本地无远程节点，请改用 `WEREAD_REMOTE_BROWSER=` 覆盖。
- `node src/weread-challenge.js run --weread-keywords 三体,明朝`：本地快速调试入口，可结合 `DEBUG=true`、`WEREAD_BROWSER=chrome`、`WEREAD_DURATION=68` 验证长时间阅读。
- `docker compose up -d`：拉起 `app` + `selenium`，常用于验收生产镜像；结束后执行 `docker compose down` 清理资源。

## 编码风格与命名约定
- 统一采用 2 space 缩进、单引号转义保持最小化；CommonJS `require` / `module.exports` 为默认模块规范。
- 常量使用 SCREAMING_SNAKE_CASE（如 `WEREAD_DURATION`），内部变量与函数沿用 camelCase；异步流程优先 async/await。
- 日志通过 `console.info|warn|error` 输出，文件句柄在顶部集中创建；新增监控点时复用 `redirectConsole` 逻辑，避免重复实现。

## 测试指南
- 当前有 Node 内置测试 `tests/regression.test.js`；提交前至少执行 `node --test tests/regression.test.js`，涉及真实浏览器链路时再执行 `npm run start` 或 `docker compose up -d`。
- 若新增 Selenium smoke case，建议放在 `tests/` 下（命名示例：`tests/login-smoke.spec.js`），覆盖登录二维码刷新、章节跳转、通知推送开关。
- 若引入额外断言库，需在 README-dev.md 追加用法；同时为每个 case 描述期望阅读时长与触发条件。

## 提交与 Pull Request 指南
- Git 历史遵循 Conventional Commits，示例：`feat: implement QR code detection`、`ci: update docker image registry`、`feat(docker): add docker-compose setup`。
- Commit message 建议格式为 `type(scope?): subject`，subject 使用动词原形且描述业务成果；多文件变更时可以进一步拆分 commits，便于 review。
- Pull Request 描述需包含：背景、变更要点、运行命令、环境变量配置、截图或 `.weread/output.log` 片段；若关联 issue 请在描述结尾附 `Closes #id`。

## 配置与安全提示
- 所有敏感凭据通过环境变量传递，严禁在仓库中硬编码邮箱密码、Bark key；推荐使用 `.env.local` 并加入 `.gitignore`。
- `cookies` 仅应保存在本地数据目录，禁止新增远程上传或统计上报逻辑。
- 部署 Docker 方案时确认宿主机具备 `--shm-size 2gb` 以避免 Chrome crash；远程运行后及时清理 `.weread/login.png` 并轮换 cookies。
- 维护 `cron` 任务时可用 `docker run --rm` 方案，将 `-v $HOME/weread-challenge/<user>/.weread:/app/.weread` 挂载到宿主机，确保多账户日志与二维码清晰分层。
