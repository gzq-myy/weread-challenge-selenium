# 微信读书挑战会员助手

只为便宜一点买微信读书会员。

## 快速开始

```bash
# 创建工作目录
mkdir -p $HOME/weread-challenge && cd $HOME/weread-challenge

# 下载配置文件
wget https://raw.githubusercontent.com/GaoHaHa-IronMan/weread-challenge-selenium/main/docker-compose.yml

# 启动服务
docker compose up -d

# 创建定时任务
(crontab -l 2>/dev/null; echo "00 */6 * * *  cd $HOME/weread-challenge && docker compose up -d > $HOME/weread-challenge/cron.log 2>&1") | crontab -

# 扫描$HOME/weread-challenge/.weread下生成的登录二维码, 开始自动阅读
```

## 微信读书规则

- 离线阅读计入总时长，但需要联网上报
- 网页版、墨水屏、小程序、听书、有声书收听**都计入总时长**
- 对单次自动阅读或收听时长过长的行为，平台将结合用户行为特征判断，**过长部分不计入总时长**
- 当日阅读超过 **5 分钟** 才算作有效阅读天数
- 付费 5 元立即获得 2 天会员，后续 30 日内打卡 29 天，读书时长超过 30 小时，可获得 30 天会员和 30 书币
- 付费 50 元立即获得 30 天会员，后续 365 日内打卡 360 天，读书时长超过 300 小时，可获得 365 天会员和 500 书币

根据实际操作，还有如下未明确说明的特点：

- **打卡周期**：第 29 日打卡后立即获得读书会员奖励，并可立即开始下一轮挑战会员打卡，无需等待第 31 日开始下一轮挑战，第 29 日的打卡既算上一轮的打卡，也算下一轮的打卡
- **年度计算**：除第一轮需 29 日外，后续每 28 日即可获得 32 日会员，1+28×13=365，一年可完成 13 轮，花费 65 元，获得 32×13=416 天会员和 390 书币
- **性价比**：更划算的仍然是年卡挑战会员，但周期更长，风险更大

## 工具特性

- 使用 Patchright Chromium 自动化浏览器
- 支持 headless 后台运行，也支持 `WEREAD_HEADLESS=false` 打开可见浏览器观察效果
- 随机浏览器宽度和高度
- 支持等待登录
- 支持登录二维码刷新
- 支持保存 cookies
- 支持加载 cookies
- 支持配置固定阅读链接直接开始阅读
- 支持从“我的书架”按关键词匹配书籍开始阅读
- 支持自动阅读
- 支持跳到下一章
- 支持读完跳回第一章继续阅读
- 支持选择阅读速度，并按可见文本量混合滚轮、短按、少量反向滚动和停顿
- 随机单页阅读时间
- 随机翻页时间
- 每分钟截图当前界面
- 支持日志
- 支持定时任务
- 支持设置阅读时间
- 支持 Bark 推送通知
- 支持 Webhook 通知
- 多平台支持: `linux | windows | macos`
- 支持架构: `amd64`
<!-- - 多架构支持: `amd64 | arm64` -->
- 支持浏览器: `chrome | edge`
- 支持多用户
- 异常时强制刷新

## CLI 子命令

| 子命令 | 作用 | 关键参数 |
| --- | --- | --- |
| `run` | 执行微信读书自动阅读主流程 | 沿用现有环境变量 |
| `schedule` | 生成计划任务命令，支持 `windows` / `macos` / `linux` | `--name` `--every` `--workdir` `--weread-duration` |
| `help` / `-h` / `--help` | 显示帮助 | 可跟 `run` / `schedule` |

```bash
# 查看总帮助
npx weread-selenium-cli -h

# 运行主流程：指定固定阅读链接
npx weread-selenium-cli run --default-book-url https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7

# run 参数会覆盖同名环境变量；未指定 DEFAULT_BOOK_URL 时按关键词从书架选书
npx weread-selenium-cli run --weread-browser chrome --weread-duration 30 --weread-keywords 三体,明朝

# 生成 Windows 计划任务创建命令
npx weread-selenium-cli schedule --name weread-hourly --every 60 --platform windows

# 计划任务仅支持附加阅读时长参数
npx weread-selenium-cli schedule --name weread-hourly --every 240 --platform windows --weread-duration 10
```

`schedule` 需要在目标平台上运行；例如 Windows 计划任务要在 Windows 上执行该子命令。
`schedule` 只生成创建/验证/删除命令，不会直接注册系统计划任务。
`schedule` 仅支持把 `--weread-duration` 追加到生成出来的 `weread-selenium-cli run` 命令中，不支持其他 `run` 参数。
Windows 默认会生成一条 `schtasks` 创建命令：先按当天某个时间点开始，再按指定间隔重复执行，重复持续时间固定为 `8760:00`。
`schedule` 未显式传 `--workdir` 时，默认使用当前用户 `HOME` 作为工作目录。
如果 Windows 创建命令执行时报 `Access is denied`，请改在“以管理员身份运行”的终端里执行生成出来的创建命令。
`run` 支持把现有环境变量改写成参数形式，优先级为：CLI 参数 > 环境变量 > 默认值。参数既支持 `--weread-browser` 这种 kebab-case，也支持 `--WEREAD_BROWSER` 这种原始环境变量名。
`weread-selenium-cli` 是主命令，旧全局命令 `weread-challenge` 继续保留，等价于执行 `weread-selenium-cli run`。
本地运行在未设置 `WEREAD_DATA_DIR` 时，默认使用当前工作目录下的 `./.weread`。

## Linux

### 直接运行

```bash
# 安装 Node.js 和 npm
sudo apt update
sudo apt install nodejs npm

# 创建运行文件夹
mkdir -p $HOME/Documents/weread-challenge
cd $HOME/Documents/weread-challenge

# 安装 npm 包
npm install -g weread-selenium-cli
npx patchright install chromium

# 设置环境变量并运行
export WEREAD_BROWSER="chrome"
export WEREAD_KEYWORDS="三体,明朝"
weread-selenium-cli run
```

也可不全局安装，直接使用 npx 运行：

```bash
npx weread-selenium-cli run --weread-keywords 三体,明朝
```

已存在的旧全局命令 `weread-challenge` 仍可直接运行。

如果你直接运行当前仓库源码，可使用：

```bash
# 安装依赖
npm install
npx patchright install chromium

# 本地可见浏览器运行，便于观察实际效果
npm run dev

# 本地浏览器 + DEBUG 日志
npm run debug

# 使用 package.json 内置示例参数运行
npm run start
```

### Docker Compose 运行

```yaml
services:
  app:
    image: docker.io/gaohaha445/weread-challenge:latest
    pull_policy: always
    environment:
      - WEREAD_DURATION=68
      - WEREAD_HEADLESS=true
      - DEFAULT_BOOK_URL=https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7
      # 如果不想固定阅读链接，删除 DEFAULT_BOOK_URL 后改用：
      # - WEREAD_KEYWORDS=三体,明朝
    volumes:
      - ./.weread:/app/.weread
    shm_size: 2gb
    dns:
      - 223.5.5.5
```

将以上内容保存为 `docker-compose.yml` 文件，然后运行：

```bash
docker compose up -d
```

首次启动后，需要微信扫描二维码登录，二维码保存在 `./.weread/login.png`
如果你仍在沿用旧版 `./data:/app/data` 挂载，请显式设置 `WEREAD_DATA_DIR=/app/data`；新部署示例统一使用 `./.weread:/app/.weread`。
Docker 镜像内已安装 Patchright Chromium，不需要 Selenium sidecar 或 `WEREAD_REMOTE_BROWSER`。

### Docker 运行

```bash
# 运行微信读书挑战
docker run --rm --name user-read \
  -v $HOME/weread-challenge/user/.weread:/app/.weread \
  -e WEREAD_DURATION=68 \
  -e DEFAULT_BOOK_URL=https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7 \
  --shm-size="2g" \
  docker.io/gaohaha445/weread-challenge:latest

# 添加第二个用户
docker run --rm --name user2-read \
  -v $HOME/weread-challenge/user2/.weread:/app/.weread \
  -e WEREAD_DURATION=68 \
  -e WEREAD_KEYWORDS=三体,明朝 \
  --shm-size="2g" \
  docker.io/gaohaha445/weread-challenge:latest
```

首次启动后，需要微信扫描二维码登录，二维码保存在 `./.weread/login.png`

### 创建定时任务

有两种方式添加定时任务：

- **docker-compose 方式**：通过 `docker-compose` 启动，Patchright Chromium 内置在应用容器中
- **docker 方式**：通过 `docker run` 启动，每个容器对应一个用户数据目录

#### docker-compose 方式

```bash
WORKDIR=$HOME/weread-challenge
mkdir -p $WORKDIR
cd $WORKDIR
cat > $WORKDIR/docker-compose.yml <<EOF
services:
  app:
    image: docker.io/gaohaha445/weread-challenge:latest
    pull_policy: always
    environment:
      - WEREAD_DURATION=68
      - WEREAD_HEADLESS=true
      - DEFAULT_BOOK_URL=https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7
      # 如果不想固定阅读链接，删除 DEFAULT_BOOK_URL 后改用：
      # - WEREAD_KEYWORDS=三体,明朝
    volumes:
      - ./.weread:/app/.weread
    shm_size: 2gb
EOF
# 首次启动后, 需微信扫描二维码登录, 二维码保存在 $HOME/weread-challenge/.weread/login.png
# 每隔6个小时, 阅读68分钟
(crontab -l 2>/dev/null; echo "00 */6 * * *  cd $WORKDIR && docker compose up -d") | crontab -
```

#### docker 方式

```bash
WEREAD_USER="user"
mkdir -p $HOME/weread-challenge/$WEREAD_USER/.weread
# 首次启动后, 需微信扫描二维码登录, 二维码保存在 $HOME/weread-challenge/$WEREAD_USER/.weread/login.png
# 每隔6个小时, 阅读68分钟
(crontab -l 2>/dev/null; echo "00 */6 * * * docker run --rm --name ${WEREAD_USER}-read -v $HOME/weread-challenge/${WEREAD_USER}/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=68 -e WEREAD_USER=${WEREAD_USER} -e WEREAD_KEYWORDS=三体,明朝 docker.io/gaohaha445/weread-challenge:latest") | crontab -
```

crontab 示例：

```bash
00 01 * * * docker run --rm --name user1-read -v /home/test/weread-challenge/user1/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=180 -e WEREAD_USER=user1 -e WEREAD_KEYWORDS=三体 -e WEBHOOK_URL=https://example.com/weread-webhook docker.io/gaohaha445/weread-challenge:latest

00 01 * * * docker run --rm --name user2-read -v /home/test/weread-challenge/user2/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=180 -e WEREAD_USER=user2 -e WEREAD_KEYWORDS=历史,科幻 -e WEBHOOK_URL=https://example.com/weread-webhook docker.io/gaohaha445/weread-challenge:latest

00 01 * * * docker run --rm --name user1-read -v /home/test/weread-challenge/user1/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=180 -e WEREAD_USER=user1 -e DEFAULT_BOOK_URL=https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7 -e BARK_KEY=your-bark-key-here docker.io/gaohaha445/weread-challenge:latest
```

## Windows

```powershell
# 安装 Node.js
winget install -e --id OpenJS.NodeJS.LTS

# 创建运行文件夹
New-Item -ItemType Directory -Force -Path "$HOME\Documents\weread-challenge"
Set-Location "$HOME\Documents\weread-challenge"

# 安装 npm 包
npm install -g weread-selenium-cli
npx patchright install chromium

# 设置环境变量并运行
$env:WEREAD_BROWSER="edge"
$env:WEREAD_KEYWORDS="三体,明朝"
weread-selenium-cli run
```

Docker 运行方式与 Linux 相同。

## MacOS

```bash
# 安装 Node.js
brew install node

# 创建运行文件夹
mkdir -p $HOME/Documents/weread-challenge
cd $HOME/Documents/weread-challenge

# 安装 npm 包
npm install -g weread-selenium-cli
npx patchright install chromium

# 设置环境变量并运行
export WEREAD_BROWSER="chrome"
export WEREAD_KEYWORDS="三体,明朝"
weread-selenium-cli run
```

Docker 运行同 Linux.

## Bark推送

Bark 是一个 iOS 设备上的推送服务，可以通过简单的 HTTP 请求向 iPhone 发送通知。本工具支持通过 Bark 推送运行状态和结果。

### 配置 Bark

1. 在 iPhone 上下载并安装 Bark App
2. 打开 Bark App，获取推送密钥（通常是设备码）
3. 设置环境变量 `BARK_KEY` 为获取的密钥
4. 可选：设置 `BARK_SERVER` 为自定义 Bark 服务器地址（默认使用官方服务器 `https://api.day.app`）

**简化配置**：只需设置 `BARK_KEY` 即可启用 Bark 推送，无需额外启用开关。

### 使用示例

#### 直接运行（Linux/MacOS/Windows）

```bash
export BARK_KEY="your-bark-key-here"
npx weread-selenium-cli run --weread-keywords 三体,明朝
```

#### Docker 运行

```bash
docker run --rm --name user-read \
  -v $HOME/weread-challenge/user/.weread:/app/.weread \
  -e WEREAD_DURATION=180 \
  -e WEREAD_KEYWORDS=三体,明朝 \
  -e BARK_KEY="your-bark-key-here" \
  --shm-size="2g" \
  docker.io/gaohaha445/weread-challenge:latest
```

#### Crontab 定时任务示例

```bash
# Bark推送示例
00 01 * * * docker run --rm --name user1-read -v /home/test/weread-challenge/user1/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=180 -e WEREAD_USER=user1 -e WEREAD_KEYWORDS=三体 -e BARK_KEY=your-bark-key-here docker.io/gaohaha445/weread-challenge:latest
```

### 注意事项

- Bark 推送依赖 iOS 设备上的 Bark App，请确保设备已安装并配置正确
- 只需设置 `BARK_KEY` 即可启用 Bark 推送，无需额外开关
- 支持自定义 Bark 服务器，通过设置 `BARK_SERVER` 环境变量
- 当脚本检测到微信读书登录二维码并解析出登录链接时，会通过 Bark 推送链接（点击即可打开）

## 登录链接推送配置（Bark + Webhook）

脚本在检测到新的微信读书登录链接后，会自动推送：

- Bark：配置 `BARK_KEY` 即可启用
- Webhook：配置 `WEBHOOK_URL` 即可启用，会发送 JSON POST 请求

Docker Compose `environment` 示例：

```yaml
environment:
  - WEREAD_DURATION=15
  - WEREAD_HEADLESS=true
  - WEREAD_SCREENSHOT=false
  - WEREAD_USER=your-user
  - BARK_KEY=your-bark-key
  - WEBHOOK_URL=https://example.com/weread-webhook
  - DEFAULT_BOOK_URL=https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7
```

说明：

- Webhook 接收 `event`、`title`、`body`、`level`、`version`、`timestamp`、`runtime`、`data` 等字段
- 登录二维码图片使用 `api.qrserver.com` 根据登录链接生成，Bark/Webhook 会收到该图片 URL
- 若二维码刷新后登录链接变化，会推送新链接
- 同一个登录链接只推送一次，避免重复提醒

## 多用户支持

```bash
# 设置用户名
WEREAD_USER1="user1"
WEREAD_USER2="user2"

# 创建用户数据目录
mkdir -p $HOME/weread-challenge/$WEREAD_USER1/.weread
mkdir -p $HOME/weread-challenge/$WEREAD_USER2/.weread

# 添加定时任务（每隔6个小时，阅读 68 分钟）
# 首次启动后需微信扫描二维码登录，二维码保存在：
# $HOME/weread-challenge/${WEREAD_USER1}/.weread/login.png
# $HOME/weread-challenge/${WEREAD_USER2}/.weread/login.png
(crontab -l 2>/dev/null; echo "00 */6 * * * docker run --rm --name ${WEREAD_USER1}-read -v $HOME/weread-challenge/${WEREAD_USER1}/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=68 -e WEREAD_USER=${WEREAD_USER1} -e WEREAD_KEYWORDS=三体,明朝 docker.io/gaohaha445/weread-challenge:latest") | crontab -
(crontab -l 2>/dev/null; echo "00 */6 * * * docker run --rm --name ${WEREAD_USER2}-read -v $HOME/weread-challenge/${WEREAD_USER2}/.weread:/app/.weread --shm-size=2g -e WEREAD_DURATION=68 -e WEREAD_USER=${WEREAD_USER2} -e DEFAULT_BOOK_URL=https://weread.qq.com/web/reader/276323e0813ab90a5g0144d7 docker.io/gaohaha445/weread-challenge:latest") | crontab -
```

## 可配置项

| 环境变量                | 默认值           | 可选值                                | 说明                                                                      |
| ----------------------- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `DEBUG`                 | `false`          | `true,false`                          | 开启调试日志                                                              |
| `WEREAD_USER`           | `weread-default` | -                                     | 用户标识                                                                  |
| `WEREAD_HEADLESS`       | `true`           | `true,false`                          | 是否以 headless 模式运行 Patchright Chromium                              |
| `WEREAD_STARTUP_DELAY`  | `0`              | -                                     | 任务启动前随机休眠的最大分钟数，`0` 表示不休眠                            |
| `WEREAD_DURATION`       | `10`             | -                                     | 阅读时长                                                                  |
| `WEREAD_SPEED`          | `slow`           | `slow,normal,fast`                    | 阅读速度；基础间隔约为 fast 1.5-3 秒，normal 3-6 秒，slow 6-12 秒；可见文本较多时会自动延长 |
| `WEREAD_SCREENSHOT`     | `true`           | `true,false`                          | 阅读期间每分钟截图                                                        |
| `WEREAD_DATA_DIR`       | `./.weread`      | -                                     | cookies、登录二维码、日志和截图的数据目录                                 |
| `DEFAULT_BOOK_URL`      | ""               | -                                     | 指定后直接打开该阅读链接；优先级高于 `WEREAD_KEYWORDS`                    |
| `WEREAD_KEYWORDS`       | ""               | -                                     | 未配置 `DEFAULT_BOOK_URL` 时使用，按英文逗号分隔，从“我的书架”匹配书名    |
| `WEREAD_BROWSER`        | `chrome`         | `chrome,edge`                         | 浏览器                                                                    |
| `BARK_KEY`              | ""               | -                                     | Bark 推送密钥                                                             |
| `BARK_SERVER`           | `https://api.day.app` | -                                | Bark 服务器地址                                                           |
| `WEBHOOK_URL`           | ""               | `http,https`                          | Webhook 通知地址                                                          |

## 注意事项

- **时长计算**：28 日刷满 30 小时，需每日至少 65 分钟，而不是每日 60 分钟
- **统计误差**：微信读书统计可能会漏数分钟，期望每日获得 65 分钟，建议调整阅读时长到 68 分钟
- **登录有效期**：网页扫码登录 cookies 有效期为 30 天，实测登录一次可以长期有效
- **使用声明**：本项目仅供学习交流使用，请勿用于商业用途，请勿用于违法用途

## 隐私提示

- `cookies` 仅保存在本地数据目录，用于复用微信读书网页登录状态
- 腾讯保护机制确保异常登录时，手机客户端将收到风险提示，可在手机客户端 `设置` -> `登录设备` 中确认登录设备
- 本工具纯 JavaScript 实现，第三方可以继续开发。即使信任本工具，也应在使用自动化工具时，经常确认登录设备，避免书架被恶意操作

## 参考

- npm 包: [weread-selenium-cli](https://www.npmjs.com/package/weread-selenium-cli)
- 开源地址: [https://github.com/jqknono/weread-challenge-selenium](https://github.com/jqknono/weread-challenge-selenium)
- 文章来源: [https://blog.techfetch.dev](https://blog.techfetch.dev/blog/2024/12/05/%E5%BE%AE%E4%BF%A1%E8%AF%BB%E4%B9%A6%E8%87%AA%E5%8A%A8%E6%89%93%E5%8D%A1%E5%88%B7%E6%97%B6%E9%95%BF/)
