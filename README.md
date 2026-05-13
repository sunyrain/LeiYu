# 蘩漪的2026号房间

面向现场演出的观众互动系统。观众用手机进入 2026 号房间，跟随文本、选择题、自由书写和 LLM 生成素材完成四段交互；舞监通过 `/admin` 控制阶段和页码，并实时查看观众提交。

这个仓库是 GitHub 发布版，只保留运行和二次开发需要的代码、素材、脚本和文档。开发过程截图、旧草稿、调试日志、设计源文件和现场运行数据不进入版本库。

## 功能

- 观众端：进场、序章、交互 1 到交互 4、结束页。
- 舞监端：阶段切换、上一页/下一页、在线人数、提交统计、答案列表、重置、触发 LLM 重新生成。
- 后端同步：Node.js + WebSocket，同一台电脑托管观众端 `/` 和舞监端 `/admin`。
- 数据保存：状态、答案和生成素材写入本地 `data/`。
- 答案导出：支持 JSON 和 CSV。
- LLM 代理：DeepSeek API Key 只放后端环境变量；没有 Key 或请求失败时自动使用本地 fallback。

## 目录

```text
.
├── README.md
├── package.json
├── start-show.ps1              # 局域网现场启动
├── start-local-only.ps1        # 只允许本机访问
├── start-public-once.ps1       # 一次性公网启动, 需要后台口令
├── app/                        # Vue 3 + Vite 前端
│   ├── public/                 # 运行时图片和字体
│   └── src/
│       ├── views/              # 观众端和舞监端页面
│       ├── stores/game.js      # 观众状态、答案元数据
│       └── services/backend.js # WebSocket/HTTP 接入
├── server/                     # HTTP + WebSocket 后端
│   ├── .env.example
│   └── src/
│       ├── index.js
│       └── prompt.js
└── docs/
    ├── USAGE_AND_CONTENT.md
    └── GITHUB_RELEASE.md
```

## 快速启动

首次安装依赖：

```powershell
npm run install:all
```

一键公网/局域网启动，并生成观众端和后台二维码：

```powershell
.\start-one-click.ps1
```

脚本会自动构建前端，优先实时读取本机网卡上的公网 IP，输出运行 IP、观众端地址、后台地址，并把二维码保存到 `data/qrcodes/`。到新场地后直接重新运行脚本即可生成新地址的二维码。如需手动覆盖 IP 或指定后台口令：

```powershell
.\start-one-click.ps1 -PublicIp 183.172.12.24 -AdminPin "至少8位的后台口令"
```

也可以通过 npm 调用：

```powershell
npm run start:one-click
```

启动局域网现场版：

```powershell
npm run start:show
```

或直接运行：

```powershell
.\start-show.ps1
```

默认端口是 `3000`：

- 观众端：`http://localhost:3000/`
- 舞监端：`http://localhost:3000/admin`
- 健康检查：`http://localhost:3000/api/health`

给观众手机使用时，把 `localhost` 换成现场电脑的局域网 IP，例如：

```text
http://192.168.10.10:3000/
http://192.168.10.10:3000/admin
```

只在本机测试：

```powershell
.\start-local-only.ps1
```

一次性公网演示需要后台口令：

```powershell
.\start-public-once.ps1 -AdminPin "至少8位的后台口令"
```

公网模式会监听 `0.0.0.0:3000`。不要公开分享 admin 地址，演出结束后立即停止进程。

## 配置

复制环境变量示例：

```powershell
Copy-Item server\.env.example server\.env
```

常用配置：

```env
HOST=0.0.0.0
PORT=3000
ADMIN_PIN=your-admin-pin
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

- `ADMIN_PIN`：后台口令。公网运行时必须设置。
- `DEEPSEEK_API_KEY`：可选。不填也能跑，系统会使用 fallback 素材。
- `HOST`：局域网现场通常用 `0.0.0.0`；本机测试可用 `127.0.0.1`。

## 使用和改文案

给运营、导演、舞监和后续开发者的详细说明见：

- [docs/USAGE_AND_CONTENT.md](docs/USAGE_AND_CONTENT.md)

这份文档说明了如何启动演出、导出数据、修改剧情文案、修改选择题、调整阶段页数、替换背景、修改 LLM prompt 和 fallback。

## 开发

分别启动后端和前端：

```powershell
npm run dev:server
npm run dev:app
```

开发前端默认运行在 `5173`，Vite 会代理：

```text
/api -> http://127.0.0.1:3000
/ws  -> ws://127.0.0.1:3000
```

构建生产前端：

```powershell
npm run build
```

后端会托管 `app/dist`。

## 数据

运行时会生成：

```text
data/show-state.json
data/answers.json
data/materials.json
```

这些是现场数据，不提交到 Git。演出结束后可用接口导出：

```text
http://你的主机:3000/api/export/answers.json
http://你的主机:3000/api/export/answers.csv
```

如果设置了 `ADMIN_PIN`，导出接口需要带口令：

```text
http://你的主机:3000/api/export/answers.csv?pin=你的口令
```

## 发布

GitHub 发布前检查见：

- [docs/GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md)

最小验证命令：

```powershell
npm run build
node --check server/src/index.js
```
