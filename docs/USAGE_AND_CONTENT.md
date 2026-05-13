# 使用与内容修改指南

这份文档给后续运营、导演、舞监和开发者使用。它说明如何启动系统、导出数据，以及如何修改文案、选项、页数、背景和 LLM 生成逻辑。

## 1. 启动演出

首次安装：

```powershell
npm run install:all
```

局域网现场启动：

```powershell
.\start-show.ps1
```

本机测试启动：

```powershell
.\start-local-only.ps1
```

一键启动并生成二维码：

```powershell
.\start-one-click.ps1
```

这个脚本会自动构建前端，实时检测当前网络出口公网 IP，输出运行 IP、观众端地址和后台地址，并通过草料二维码开放接口生成两张 PNG。到新场地后直接重新运行脚本即可按当时的公网 IP 生成新二维码：

```text
data/qrcodes/audience.png
data/qrcodes/admin.png
```

如果公网 IP 需要手动覆盖：

```powershell
.\start-one-click.ps1 -PublicIp 183.172.12.24 -AdminPin "至少8位的后台口令"
```

公网一次性启动：

```powershell
.\start-public-once.ps1 -AdminPin "至少8位的后台口令"
```

打开地址：

```text
观众端: http://主机IP:3000/
舞监端: http://主机IP:3000/admin
健康检查: http://主机IP:3000/api/health
```

公网运行时必须设置后台口令，不要把 `/admin` 地址发给观众。

## 2. 舞监操作

舞监打开 `/admin` 后可以：

- 切换阶段：进场、序章、交互 1、交互 2、交互 3、交互 4。
- 翻页：上一页、下一页。
- 查看在线人数、提交数、完成率。
- 查看四轮交互的观众答案。
- 触发 LLM 重新生成。
- 重置全场状态。

重置会清空当前后端里的演出状态、答案和生成素材。正式演出前可以重置，演出结束后先导出数据再重置。

## 3. 导出答案

导出地址：

```text
http://主机IP:3000/api/export/answers.json
http://主机IP:3000/api/export/answers.csv
```

如果配置了 `ADMIN_PIN`，用：

```text
http://主机IP:3000/api/export/answers.csv?pin=后台口令
```

运行时数据保存在 `data/`，不进入 Git：

```text
data/show-state.json
data/answers.json
data/materials.json
```

## 4. 修改剧情文案

观众端剧情文案主要在这些文件：

```text
app/src/views/phases/EntryPhase.vue
app/src/views/phases/ProloguePhase.vue
app/src/views/phases/Act1Phase.vue
app/src/views/phases/Act2Phase.vue
app/src/views/phases/Act3Phase.vue
app/src/views/phases/Act4Phase.vue
```

常见结构：

```js
const blocks = {
  0: {
    lines: ['第一行', '第二行'],
    projection: '可选的投影/引用文本',
  },
}
```

修改规则：

- `lines` 是页面上逐行显示的正文。
- `projection` 是额外强调文本，当前在部分阶段使用。
- `className` 可控制特殊样式，例如 `large-line`、`notice-line`。
- 不要改 `gameState.currentPage === 数字` 的数字，除非你正在调整流程页数。
- 文案里可以使用观众输入，例如 `${gameState.roomNumber}`、`${gameState.lovedOneName}`、`${items.value[0]}`。

## 5. 修改输入框和提示语

输入框在阶段组件的 `<template>` 里。

例子：

```vue
<input
  type="text"
  v-model="nameInput"
  class="line-input"
  placeholder="写下那个名字"
/>
```

常改内容：

- `placeholder`：输入框里的提示文字。
- 输入框前后的 `<p>`：上下文说明。
- `floodPlaceholders`：交互 1 三个物件输入框的占位文案。

相关文件：

```text
app/src/views/phases/EntryPhase.vue
app/src/views/phases/Act1Phase.vue
app/src/views/phases/Act4Phase.vue
```

## 6. 修改选择题选项

选择题选项在各阶段组件里，例如：

```js
const departureOptions = [
  { value: 'A', label: '抬头仰望' },
  { value: 'B', label: '抱紧自己' },
  { value: 'C', label: '向外探望' },
  { value: 'D', label: '用力跺脚' },
]
```

修改选项文字时，必须同步检查：

```text
app/src/stores/game.js
```

其中 `optionLabels` 决定导出和舞监后台里显示的选项文本。组件里的选项文字和 `optionLabels` 要保持一致。

涉及的选项题：

```text
Act1Phase.vue
  departureOptions     # 问题 1
  reunionOptions       # 问题 2

Act2Phase.vue
  noticeOptions        # 问题 3
  riverOptions         # 问题 4

Act3Phase.vue
  roomOptions          # 问题 5-8, 由 LLM/fallback 生成
  identityOptions      # 问题 9

Act4Phase.vue
  mirrorOptions        # 问题 10
  transformOptions     # 问题 11
  objectOptions        # 问题 12
  finalOptions         # 问题 13
```

如果新增或删除题目，还要改 `answerMeta`，否则答案可能不会正确提交或导出。

## 7. 修改阶段页数和流程

系统用两个状态控制观众端显示：

```text
currentPhase  # entry, prologue, act1, act2, act3, act4
currentPage   # 当前阶段内的页码, 从 0 开始
```

调整页数时必须同步检查：

```text
app/src/views/StoryView.vue
  interactivePages  # 哪些页不能点击空白自动翻页
  waitingPages      # 哪些页开始进入等待舞监状态
  terminalPages     # 结束页

app/src/views/AdminView.vue
  maxPages          # 舞监后台显示的每阶段页数

各 phase 组件
  submitXxx()       # 提交后跳到哪一页
  currentBlock      # 文本页内容
```

页码从 0 开始，但舞监界面显示时会加 1。例如 `currentPage = 0` 显示为第 1 页。

## 8. 修改背景图

当前每个阶段使用一张 WebP 背景：

```text
app/public/backgrounds/entry-threshold.webp
app/public/backgrounds/prologue-notice.webp
app/public/backgrounds/act1-flood-memory.webp
app/public/backgrounds/act2-thunderfire.webp
app/public/backgrounds/act3-room-rebuild.webp
app/public/backgrounds/act4-afterstorm.webp
```

阶段和背景的对应关系在：

```text
app/src/views/StoryView.vue
```

```js
const phaseBackgrounds = {
  entry: '/backgrounds/entry-threshold.webp',
  prologue: '/backgrounds/prologue-notice.webp',
  act1: '/backgrounds/act1-flood-memory.webp',
  act2: '/backgrounds/act2-thunderfire.webp',
  act3: '/backgrounds/act3-room-rebuild.webp',
  act4: '/backgrounds/act4-afterstorm.webp',
}
```

建议：

- 图片比例使用 9:16。
- 优先使用 `.webp`，体积更小。
- 中央区域要保持偏暗，避免压住竖排/居中的文字。
- 替换同名文件最安全；如果改文件名，要同步改 `phaseBackgrounds`。

## 9. 修改 LLM 生成逻辑

LLM 只在后端调用，相关文件：

```text
server/src/prompt.js
server/src/index.js
app/src/views/phases/Act3Phase.vue
```

常改位置：

- `server/src/prompt.js` 的 `POEM_PROMPT`：控制 DeepSeek 生成什么。
- `server/src/prompt.js` 的 `fallbackMaterials()`：没有 API Key 或 LLM 失败时使用的本地素材。
- `Act3Phase.vue` 的 `roomOptions`：控制生成素材如何拼成第 5-8 题的四个选项。

配置文件：

```text
server/.env
```

```env
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

不要把真实 API Key 写进 `app/src/` 或提交到 Git。

## 10. 修改后台文案

舞监后台在：

```text
app/src/views/AdminView.vue
```

常改内容：

- `phaseLabels`：阶段名称。
- `maxPages`：每个阶段页数。
- 页面上的统计标题、按钮文字、空状态文字。

如果改了阶段 key，例如把 `act1` 改成别的名字，还要同步：

```text
server/src/index.js       # phaseOrder, phaseToAnswerIndex
app/src/stores/game.js    # answerMeta
app/src/views/StoryView.vue
```

通常不建议改阶段 key，只改显示名称即可。

## 11. 修改后必须验证

每次改文案、选项或流程后，至少运行：

```powershell
npm run build
node --check server/src/index.js
```

建议完整检查：

- 本机打开 `/` 和 `/admin`。
- 舞监切换每个阶段，观众端能同步。
- 每个输入框和选择题都能提交。
- 舞监后台能看到答案。
- 导出 CSV 能打开且没有乱码。
- 没有 API Key 时，交互 3 仍能出现 fallback 选项。

## 12. 不要提交的内容

这些内容默认已被 `.gitignore` 排除：

```text
data/
*.log
.env
server/.env
preview_exports/
draft.md
设计源文件和旧截图
```

如果临时产生了截图、录屏、现场数据或调试日志，不要放进 GitHub 发布版。
