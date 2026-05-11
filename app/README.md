# app 前端工程说明

`app/` 是《蘩漪的2026号房间》的 Vue 3 + Vite 前端。它包含观众端剧情页面、舞监控制台、文字动画、阶段组件和后端接入层。

完整启动和现场部署见根目录 [README.md](../README.md)。

## 启动

开发模式需要先启动后端：

```powershell
npm run dev:server
npm run dev:app
```

或在本目录内单独启动前端：

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

构建：

```powershell
npm run build
```

构建产物在 `dist/`，由根目录后端托管。

## 前端入口

```text
/       观众端
/admin  舞监端
```

路由定义在 `src/router/index.js`。

## 关键文件

```text
src/main.js
  创建 Vue 应用。观众端会初始化后端 WebSocket 连接。

src/views/StoryView.vue
  观众端外层容器。根据 gameState.currentPhase/currentPage 渲染阶段组件，并处理翻页、文字散落动画和背景粒子。

src/views/AdminView.vue
  舞监控制台。连接后端 WebSocket，发送阶段/页码控制，接收统计和答案。

src/views/phases/
  具体剧情阶段。

src/stores/game.js
  观众端展示状态。它不再负责跨设备同步，答案会提交到后端。

src/services/backend.js
  WebSocket 和 HTTP 后端接入。负责连接 `/ws`、提交答案、控制舞监状态、调用 `/api/generate-materials`。

src/llm.js
  只保留 `generatePoemMaterials()` 包装，实际请求走后端。
```

## 状态流

```text
舞监 /admin
  -> backend.setShowState(phase, page)
  -> WebSocket admin:set-state
  -> Node 后端
  -> WebSocket server:state
  -> 观众端更新 gameState.currentPhase/currentPage
```

观众提交：

```text
阶段组件
  -> setAnswer(key, value, meta)
  -> submitAnswerToBackend(...)
  -> WebSocket audience:submit-answer
  -> Node 后端保存到 data/answers.json
  -> WebSocket server:stats
  -> 舞监端更新统计和答案列表
```

LLM：

```text
Act3Phase.vue
  -> generatePoemMaterials(...)
  -> POST /api/generate-materials
  -> Node 后端读取 server/.env
  -> DeepSeek 或 fallback
  -> 返回 materials
```

## 当前状态字段

```js
gameState = {
  roomNumber,
  floodItem,
  lovedOneName,
  tombMaterial,
  tombAction,
  roomBase,
  identity,
  finalDoor,
  finalTransform,
  finalAction,
  poemMaterials,
  currentPhase,
  currentPage,
}
```

阶段：

```text
entry -> prologue -> act1 -> act2 -> act3 -> act4
```

## 交互页配置

`StoryView.vue` 中的 `interactivePages` 控制哪些页面不能点击空白自动翻页：

```js
const interactivePages = {
  entry: [0, 1],
  prologue: [1],
  act1: [7, 14, 15],
  act2: [6, 7],
  act3: [7, 8, 9],
  act4: [6, 7],
}
```

调整阶段页数时，要同步检查：

- `StoryView.vue` 的 `interactivePages`
- `AdminView.vue` 的 `maxPages`
- 对应 phase 组件的提交后跳转页

## 后端开发代理

`vite.config.js` 已配置：

```js
server: {
  proxy: {
    '/api': 'http://127.0.0.1:3000',
    '/ws': {
      target: 'ws://127.0.0.1:3000',
      ws: true,
    },
  },
}
```

因此开发时前端仍然使用相对路径 `/api` 和 `/ws`，生产时则由后端同源托管。

## 开发注意

- 不要在 `src/` 放任何真实 API Key。
- 选项题提交时要传入选项文本，不能只保存 `A/B/C/D`。
- 观众端可以在交互提交后本地进入等待页；舞监端的下一次广播仍然是全局状态来源。
- LLM 失败必须继续可用，不能卡住现场。
- 移动端优先测试输入框、长文本滚动、软键盘和按钮区域。

## 已验证

- 前端构建通过。
- 构建产物未包含旧 DeepSeek Key。
- 观众端、舞监端和后端通过 WebSocket 同步。
- LLM 请求已后端化，并支持 fallback。
