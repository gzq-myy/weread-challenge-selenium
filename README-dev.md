## 如何参与开发

```bash
# 安装依赖
npm install
npx patchright install chromium

# 查看 CLI 帮助
node src/weread-challenge.js -h

# 运行主流程：按关键词从“我的书架”选书
node src/weread-challenge.js run --weread-keywords 三体,明朝

# 打开可见浏览器，便于观察实际阅读效果
WEREAD_HEADLESS=false node src/weread-challenge.js run --weread-keywords 三体,明朝

# run 参数优先于同名环境变量
node src/weread-challenge.js run --weread-browser chrome --weread-duration 30 --default-book-url https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7

# 链接到全局命令
npm run link:global

# 兼容旧全局命令
weread-challenge

# 取消全局链接
npm run unlink:global

# 生成计划任务命令
node src/weread-challenge.js schedule --name weread-hourly --every 60 --workdir /absolute/path
```

本地 CLI 默认把 cookies、二维码、日志、截图写到当前工作目录下的 `.weread`；如需沿用旧版 `data/`，请显式设置 `WEREAD_DATA_DIR=./data`。
`DEFAULT_BOOK_URL` 优先级高于 `WEREAD_KEYWORDS`；两者都未配置时，登录后会停止并提示无法选书。

`vscode` 内按 `F5` 运行, 选择 `node`, 开始调试, 默认使用 `chrome` 浏览器.

## 已知问题

- [ ] Patchright 模式仅支持 Chromium 内核浏览器，`WEREAD_BROWSER` 仅支持 `chrome` 与 `edge`。
