# 前端说明

`app/` 是《蘩漪的2026号房间》的 Vue 3 + Vite 前端，包含观众端剧情页面、舞监控制台、文字动画、背景粒子和后端接入层。

完整启动、现场部署和文案修改见：

- [../README.md](../README.md)
- [../docs/USAGE_AND_CONTENT.md](../docs/USAGE_AND_CONTENT.md)

## 启动

开发模式需要先启动后端：

```powershell
npm run dev:server
npm run dev:app
```

只构建前端：

```powershell
npm --prefix app run build
```

构建产物在 `app/dist/`，由根目录后端托管。

## 前端入口

```text
/       观众端
/admin  舞监端
```

路由定义在 `src/router/index.js`。

## 关键文件

```text
src/main.js
  创建 Vue 应用。观众端会初始化后端 WebSocket。

src/views/StoryView.vue
  观众端外层容器。根据 currentPhase/currentPage 渲染阶段组件，并处理翻页、文字散落、背景和粒子。

src/views/AdminView.vue
  舞监控制台。发送阶段/页码控制，接收统计和答案。

src/views/phases/
  具体剧情阶段。主要剧情文案、输入框和选择题在这里。

src/stores/game.js
  观众端状态、答案元数据、选项导出标签。

src/services/backend.js
  WebSocket 和 HTTP 后端接入。

src/llm.js
  调用后端 `/api/generate-materials`。
```

## 流程

```text
舞监 /admin
  -> admin:set-state
  -> Node 后端
  -> server:state
  -> 所有观众端同步 phase/page
```

观众提交：

```text
阶段组件
  -> setAnswer(...)
  -> audience:submit-answer
  -> Node 后端保存 data/answers.json
  -> server:stats
  -> 舞监端更新统计和答案列表
```

## 修改注意

- 改选择题选项时，同步改 `src/stores/game.js` 的 `optionLabels`。
- 改题目或新增答案字段时，同步改 `answerMeta`。
- 改阶段页数时，同步检查 `StoryView.vue` 的 `interactivePages`、`waitingPages`、`terminalPages`，以及 `AdminView.vue` 的 `maxPages`。
- 不要在前端放真实 API Key。
- 移动端优先测试输入框、长文本滚动、软键盘和按钮区域。
