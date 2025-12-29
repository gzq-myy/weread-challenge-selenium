const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync, spawnSync } = require("child_process");
const os = require("os");
const nodemailer = require("nodemailer");
const { URL } = require("url");
const {
  DEBUG,
  EMAIL_PORT,
  BARK_KEY,
  BARK_SERVER,
  WEREAD_REMOTE_BROWSER,
} = require("./config");

// --- Logging Setup ---
let logStream;

function setupLogger() {
  if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
  }
  logStream = fs.createWriteStream("./data/output.log", { flags: "w" });

  if (!DEBUG) {
    ["info", "warn", "error"].forEach((method) => {
      const originalMethod = console[method];
      console[method] = function (...args) {
        let logstr =
          `[${method.toUpperCase()}][${new Date()
            .toISOString()
            .replace("T", " ")
            .replace("Z", "")}]: ` +
          args.join(" ");
        logStream.write(logstr + "\r\n");
        originalMethod.apply(console, args);
      };
    });
  }
}

// --- Http Utils ---
function isHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function fetchJson(url, timeoutMs = 3000) {
  return await new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data || "{}") });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
  });
}

// --- Diagnostics ---
async function checkSeleniumHealth(remoteUrl) {
  try {
    if (!remoteUrl || !isHttpUrl(remoteUrl)) {
      console.warn("跳过健康检查：WEREAD_REMOTE_BROWSER 未设置或非法。");
      return null;
    }
    const base = remoteUrl.endsWith("/") ? remoteUrl.slice(0, -1) : remoteUrl;
    const endpoints = ["/status", "/wd/hub/status"];
    for (const ep of endpoints) {
      try {
        const { statusCode, body } = await fetchJson(`${base}${ep}`, 3000);
        if (statusCode >= 200 && statusCode < 300) {
          const ready = body?.ready ?? body?.value?.ready;
          console.info(`Selenium 健康检查 ${ep} 响应: ready=${ready}`);
          return { endpoint: ep, ready, raw: body };
        }
      } catch (_) {
        // continue
      }
    }
    console.warn("Selenium 健康检查失败：所有端点无有效响应。");
    return null;
  } catch (e) {
    console.warn("Selenium 健康检查异常：", e.message || e);
    return null;
  }
}

function dockerAvailable() {
  try {
    const out = spawnSync("docker", ["version"], { encoding: "utf8" });
    return out.status === 0;
  } catch (_) {
    return false;
  }
}

function findSeleniumContainers() {
  try {
    const out = execSync(
      'docker ps --format "{{.ID}}\t{{.Image}}\t{{.Names}}"',
      { encoding: "utf8" }
    );
    const lines = out.split(/\r?\n/).filter(Boolean);
    const hits = lines
      .map((l) => {
        const [id, image, name] = l.split(/\t/);
        return { id, image, name };
      })
      .filter((x) =>
        /selenium\/(standalone-|node-).*chrome/i.test(x.image || "") ||
        /selenium/i.test(x.name || "")
      );
    return hits;
  } catch (e) {
    console.warn("查找 Selenium 容器失败：", e.message || e);
    return [];
  }
}

function collectSeleniumLogs(tail = 300) {
  try {
    if (!dockerAvailable()) {
      console.warn("Docker 不可用，跳过 selenium 日志抓取。");
      return null;
    }
    const containers = findSeleniumContainers();
    if (!containers.length) {
      console.warn("未发现运行中的 selenium 容器，跳过日志抓取。");
      return null;
    }
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    const outFile = path.join("./data", `selenium-logs-${ts}.log`);
    let combined = "";
    for (const c of containers) {
      try {
        const logs = execSync(`docker logs --tail=${tail} ${c.id} 2>&1`, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        combined += `\n===== CONTAINER ${c.name} (${c.image}) =====\n` + logs;
      } catch (e) {
        combined += `\n===== CONTAINER ${c.name} (${c.image}) 日志获取失败: ${e.message} =====\n`;
      }
    }
    fs.writeFileSync(outFile, combined, "utf8");
    console.info("已抓取 selenium 容器日志:", outFile);
    return outFile;
  } catch (e) {
    console.warn("保存 selenium 日志失败：", e.message || e);
    return null;
  }
}

async function collectDiagnostics(reason) {
  try {
    console.warn("开始收集诊断信息，原因：", reason?.toString()?.slice(0, 180) || "未知");
    await checkSeleniumHealth(WEREAD_REMOTE_BROWSER);
    collectSeleniumLogs(400);
  } catch (_) {
    // ignore
  }
}

function getOSInfo() {
  const platform = os.platform();
  const release = os.release();
  switch (platform) {
    case "win32":
      return `Windows ${release}`;
    case "darwin":
      return `MacOS ${release}`;
    case "linux":
      return `Linux ${release}`;
    default:
      return `${platform} ${release}`;
  }
}

// --- Notifications ---
async function sendMail(subject, text, filePaths = []) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("Email credentials not found. Skipping email.");
      return false;
  }
  const secure = EMAIL_PORT === 465;
  let transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP,
    port: EMAIL_PORT,
    secure: secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const attachments = filePaths.map((filePath) => ({
    filename: path.basename(filePath),
    path: filePath,
    cid: path.basename(filePath),
    contentType: `image/${path.extname(filePath).substring(1)}`,
  }));

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  let mailOptions = {
    from: fromAddress,
    to: process.env.EMAIL_TO,
    subject: subject,
    attachments: attachments,
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        </style>
    </head>
    <body>
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #2c3e50;">WeRead Challenge Daily Report</h2>
                <p style="color: #7f8c8d;">${new Date().toLocaleDateString()}</p>
            </div>
            
            <div style="background: #f9f9f9; border-left: 4px solid #2980b9; padding: 15px; margin: 20px 0;">
                <p>Dear User,</p>
                <p>${text}</p>
                <p>Here are your reading statistics and achievements for today.</p>
            </div>

            <div class="image-gallery">
                ${attachments
        .map(
          (att) => `
                    <img src="cid:${att.cid}" alt="Reading Progress" style="display: block; margin: 10px auto;"/>
                `
        )
        .join("")}
            </div>

            <div style="margin: 20px 0;">
                <p>Best regards,</p>
                <p style="color: #2980b9;">WeRead Challenge Team</p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            
            <div style="font-size: 12px; color: #7f8c8d; text-align: center;">
                <p>This is an automated message, please do not reply.</p>
            </div>
        </div>
    </body>
    </html>
`,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.info("Email sent successfully");
    console.info("Message ID: ", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email: ", error);
    return false;
  }
}

async function sendBark(title, body, options = {}) {
  if (!BARK_KEY) {
    console.info("Bark推送密钥未配置");
    return;
  }

  const {
    subtitle = "",
    sound = "alarm",
    group = "WeRead-Challenge",
    icon = "",
    url = "",
    level = "active"
  } = options;

  let barkUrl = `${BARK_SERVER}/${BARK_KEY}`;

  if (subtitle) {
    barkUrl += `/${encodeURIComponent(title)}/${encodeURIComponent(subtitle)}/${encodeURIComponent(body)}`;
  } else if (title && body) {
    barkUrl += `/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
  } else {
    barkUrl += `/${encodeURIComponent(body)}`;
  }

  const params = new URLSearchParams();
  if (sound && sound !== "alarm") params.append("sound", sound);
  if (group && group !== "WeRead-Challenge") params.append("group", group);
  if (icon) params.append("icon", icon);
  if (url) params.append("url", url);
  if (level && level !== "active") params.append("level", level);

  const paramString = params.toString();
  if (paramString) {
    barkUrl += `?${paramString}`;
  }

  console.info("发送Bark推送:", barkUrl);

  return new Promise((resolve) => {
    try {
      const httpModule = barkUrl.startsWith("https://") ? https : http;

      const req = httpModule.request(barkUrl, {
        method: "GET",
        headers: {
          "User-Agent": "WeRead-Tracker/1.0"
        }
      }, (res) => {
        let responseData = "";
        res.on("data", (chunk) => { responseData += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.info("Bark推送发送成功");
          } else {
            console.error(`Bark推送失败: ${res.statusCode} - ${responseData}`);
          }
          resolve();
        });
      });

      req.on("error", (error) => {
        console.error("Bark推送请求错误:", error.message);
        resolve();
      });

      req.end();
    } catch (error) {
      console.error("Bark推送异常:", error);
      resolve();
    }
  });
}

module.exports = {
  setupLogger,
  isHttpUrl,
  fetchJson,
  checkSeleniumHealth,
  dockerAvailable,
  findSeleniumContainers,
  collectSeleniumLogs,
  collectDiagnostics,
  getOSInfo,
  sendMail,
  sendBark,
};
