# 蘩漪的2026号房间

这是一个面向现场演出的观众交互系统。观众用手机进入 2026 号房间，跟随文本、选择题、自由书写和 LLM 生成内容完成四段交互；舞监通过 `/admin` 控制全场阶段和页码，并实时查看观众提交。

当前版本已经从单机前端原型升级为“笔记本实体后端”架构：同一台电脑同时运行后端、托管观众端和舞监端。观众和舞监设备只需要访问这台电脑的局域网 IP。

## 当前能力

- 观众端完整剧情链路：进场、序章、交互 1、交互 2、交互 3、交互 4、结束页。
- 舞监控制台：阶段切换、上一页/下一页、在线人数、提交统计、四轮答案列表、重置、触发 LLM 重新生成。
- 后端同步：Node.js + WebSocket，舞监指令会广播到观众端，多设备不再依赖 `localStorage`。
- 后端托管：后端直接托管 `app/dist`，观众端 `/` 和舞监端 `/admin` 都来自同一台电脑。
- LLM 代理：前端不再包含 DeepSeek API Key，生成请求走后端 `/api/generate-materials`。
- 失败降级：没有 API Key 或 LLM 失败时，后端返回本地 fallback 素材，不阻塞现场流程。
- 数据持久化：后端把演出状态、答案和生成素材写入 `data/`。
- 导出接口：支持 `/api/export/answers.json` 和 `/api/export/answers.csv`。

## 目录结构

```text
.
├── README.md
├── package.json                     # 根脚本：安装、构建、启动演出
├── start-show.ps1                   # Windows 一键构建并启动
├── app/                             # Vue 3 + Vite 前端
│   ├── src/views/StoryView.vue      # 观众端容器
│   ├── src/views/AdminView.vue      # 舞监控制台
│   ├── src/views/phases/            # 各阶段页面
│   ├── src/stores/game.js           # 观众端本地展示状态
│   ├── src/services/backend.js      # WebSocket/HTTP 后端接入
│   └── src/llm.js                   # 调用后端 LLM 代理
├── server/                          # 笔记本实体后端
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js                 # HTTP + WebSocket + 静态托管
│       └── prompt.js                # LLM prompt 与 fallback
└── data/                            # 运行时生成，已加入 .gitignore
```

## 快速启动

首次安装：

```powershell
npm run install:all
```

启动现场版本：

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

局域网内给观众使用时，把 `localhost` 换成笔记本 IP，例如：

- 观众二维码：`http://192.168.10.10:3000/`
- 舞监控制台：`http://192.168.10.10:3000/admin`

## 推荐现场拓扑

```text
观众手机
   │
   │ 专用 Wi-Fi
   ▼
独立路由器
   │
   │ 建议网线连接
   ▼
笔记本后端 + 舞监
   - Node.js 后端
   - 静态前端托管
   - WebSocket 同步
   - 答案持久化
   - LLM 代理和 fallback
   - 同机打开 /admin
```

这种方案是可行的，并且适合现场控制。普通近年笔记本承载几十到一两百名观众通常没有问题，瓶颈更可能是 Wi-Fi 质量和外部 LLM 响应。

## 现场电脑配置

- 使用独立路由器，不依赖剧场公共 Wi-Fi。
- 笔记本接电源。
- 关闭系统休眠、自动更新和省电网络策略。
- 给笔记本固定局域网 IP，例如 `192.168.10.10`。
- Windows 防火墙允许 Node.js 或端口 `3000` 入站。
- 演前用两台以上手机测试 `/` 能被舞监 `/admin` 控制。
- 如果现场没有稳定外网，不填 LLM Key，系统会自动用 fallback 素材。

## LLM 配置

复制配置文件：

```powershell
Copy-Item server\.env.example server\.env
```

在 `server/.env` 中填写：

```env
HOST=0.0.0.0
PORT=3000
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

不填写 `DEEPSEEK_API_KEY` 也能运行，后端会返回本地 fallback。前端构建产物中不再包含 API Key。

已经暴露过的旧前端 Key 应立即在 DeepSeek 后台撤销。

## 当前架构

```text
┌──────────────────────┐
│ 观众手机 /            │
└──────────┬───────────┘
           │ HTTP + WebSocket
           ▼
┌──────────────────────────────────┐
│ 笔记本 Node 后端                  │
│ - 托管 app/dist                   │
│ - /ws 广播舞监状态                │
│ - /api/generate-materials         │
│ - /api/export/answers.csv/json    │
│ - data/*.json 持久化              │
└──────────┬───────────────────────┘
           ▲
           │ HTTP + WebSocket
┌──────────┴───────────┐
│ 舞监 /admin           │
└──────────────────────┘
```

后端是唯一全局状态来源。舞监端发出的 `phase/page` 变化会进入后端，再由后端广播给所有观众端。观众提交答案也进入后端，再聚合给舞监端。

## 事件与接口

WebSocket：

```text
client:hello
audience:join
audience:submit-answer
admin:set-state
admin:reset
admin:trigger-llm
server:state
server:stats
server:reset
server:llm-trigger
server:error
```

HTTP：

```text
GET  /api/health
GET  /api/state
GET  /api/answers
GET  /api/export/answers.json
GET  /api/export/answers.csv
POST /api/reset
POST /api/generate-materials
```

## 数据保存

运行后端时会生成：

```text
data/show-state.json
data/answers.json
data/materials.json
```

这些文件是现场运行数据，默认不提交到版本库。演出结束后可以通过导出接口保存答案，也可以直接备份 `data/`。

## 开发模式

分别启动后端和前端：

```powershell
npm run dev:server
npm run dev:app
```

开发前端默认在 `5173`，Vite 已代理：

- `/api` -> `http://127.0.0.1:3000`
- `/ws` -> `ws://127.0.0.1:3000`

## 验证记录

已完成的本地验证：

- `npm --prefix app run build` 通过。
- `node --check server/src/index.js` 通过。
- 后端 `/api/health` 可访问。
- WebSocket 可完成舞监设置阶段、观众接收阶段、观众提交答案、舞监收到统计。
- `/api/generate-materials` 在无 Key 情况下返回 fallback。
- 构建产物中未再检出 `sk-` 或 `api.deepseek.com`。

## 演前检查清单

- `npm run install:all` 已完成。
- `server/.env` 已确认，是否需要 LLM Key 已明确。
- `npm run start:show` 能启动。
- 本机能打开 `/admin`。
- 至少两台手机能打开 `/`。
- 舞监切换阶段后，两台手机同步变化。
- 提交答案后，舞监端统计和答案列表更新。
- `http://笔记本IP:3000/api/export/answers.csv` 能下载。
- 电脑不会休眠，防火墙已放行。
- 已准备备用路由器、网线、电源和本地 fallback 流程。
