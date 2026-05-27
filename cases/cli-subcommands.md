## CLI 子命令验收用例

| 场景 | 前置条件 / 输入 | 预期结果 |
| --- | --- | --- |
| 查看总帮助 | 执行 `node src/weread-challenge.js -h` | 输出 `run`、`schedule`、`help` 的用法，不启动浏览器 |
| 查看 `schedule` 帮助 | 执行 `node src/weread-challenge.js help schedule` | 输出 `schedule` 所需参数、默认 `HOME` 工作目录、输出命令说明，以及 `--dry-run` 已无额外效果 |
| 查看 `run` 帮助 | 执行 `node src/weread-challenge.js help run` | 输出 `run` 支持的参数列表，并标明参数优先于同名环境变量 |
| 兼容旧入口 | 执行 `node src/weread-challenge.js` | 先提示应改用 `run` 子命令，再按原行为进入自动阅读主流程 |
| 兼容旧全局命令 | 全局安装或 `npm link` 后执行 `weread-challenge` | 进入与 `weread-selenium-cli run` 相同的 CLI 入口与主流程 |
| 显式运行主流程 | 执行 `node src/weread-challenge.js run --weread-keywords 三体` | 行为与旧入口一致，并按关键词从“我的书架”选书 |
| `run` 参数覆盖环境变量 | 先设置环境变量 `WEREAD_BROWSER=chrome`，再执行 `node src/weread-challenge.js run --weread-browser edge` | 实际运行配置使用 `edge` |
| `run` 支持原始环境变量名参数 | 执行 `node src/weread-challenge.js run --WEREAD_DURATION 30` | 实际运行配置中的阅读时长为 `30` 分钟 |
| `run` 打开可见浏览器 | 执行 `node src/weread-challenge.js run --weread-headless false --weread-keywords 三体` | 使用 Patchright 打开可见 Chromium 窗口，便于观察实际阅读效果 |
| `run` 默认数据目录 | 未设置 `WEREAD_DATA_DIR` 时执行 `node src/weread-challenge.js run --weread-keywords 三体` | cookies、二维码、日志、截图写入当前工作目录下的 `.weread/` |
| `run` 显式数据目录覆盖 | 执行 `node src/weread-challenge.js run --weread-data-dir custom-data --weread-keywords 三体` | 运行产物只写入 `custom-data/` |
| `run` 固定链接选书 | 执行 `node src/weread-challenge.js run --default-book-url https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7` | 登录成功后直接打开指定阅读链接 |
| `run` 关键词选书 | 执行 `node src/weread-challenge.js run --weread-keywords 三体,明朝`，且未配置 `DEFAULT_BOOK_URL` | 登录成功后打开“我的书架”，按关键词匹配书名 |
| Windows 计划任务命令生成 | 在 Windows 上执行 `node src/weread-challenge.js schedule --name weread-hourly --every 60 --platform windows --weread-duration 10` | 输出一条 `schtasks` 创建命令；任务默认从当天某个时间点开始，并按每 60 分钟重复执行，重复持续时间固定为 `8760:00`；生成的运行命令仅包含 `weread-selenium-cli run --weread-duration 10`，默认工作目录为 `HOME` |
| `schedule` 拒绝额外 `run` 参数 | 执行 `node src/weread-challenge.js schedule --name weread-hourly --every 60 --platform windows --webhook-url https://example.com/hook` | 直接报错，提示 `schedule` 除自身任务参数外仅支持 `--weread-duration` |
| macOS 计划任务命令生成 | 在 macOS 上执行 `node src/weread-challenge.js schedule --name weread-hourly --every 60 --workdir /Users/demo/weread-challenge-selenium --platform macos` | 输出 `launchd plist` 相关创建/验证/回滚命令，不触发系统写入 |
| Linux 计划任务命令生成 | 在 Linux 上执行 `node src/weread-challenge.js schedule --name weread-hourly --every 60 --workdir /home/demo/weread-challenge-selenium --platform linux` | 输出 `systemd --user` 的 service/timer 创建/验证/回滚命令，不触发系统写入 |
| 非绝对路径工作目录 | 执行 `node src/weread-challenge.js schedule --name weread-hourly --every 60 --workdir .` | 直接报错 `--workdir must be an absolute path` |
| 跨平台平台保护 | 在 Windows 上执行 `node src/weread-challenge.js schedule --name weread-hourly --every 60 --workdir F:\\code\\weread-challenge-selenium --platform linux` | 直接报错并提示切换到目标 OS |
