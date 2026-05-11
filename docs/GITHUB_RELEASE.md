# GitHub 发布检查

这份清单用于准备公开仓库或打 release tag。

## 发布版应包含

```text
README.md
package.json
start-show.ps1
start-local-only.ps1
start-public-once.ps1
app/
server/
docs/USAGE_AND_CONTENT.md
docs/GITHUB_RELEASE.md
```

## 发布版不应包含

```text
data/
*.log
.env
server/.env
preview_exports/
draft.md
docs/background-prompts.md
*.ai
*.pdf
根目录旧截图
临时公网演示脚本 start-demo-public.ps1
```

`start-demo-public.ps1` 是本机临时演示脚本，里面可能包含现场 IP 或关闭后台口令的配置，不适合发布。

## 发布前命令

```powershell
npm run install:all
npm run build
node --check server/src/index.js
git status --short
```

确认 `git status --short` 里没有运行数据、日志、`.env` 或调试截图。

## 本地功能检查

```powershell
.\start-local-only.ps1
```

检查：

- `http://127.0.0.1:3000/` 可打开。
- `http://127.0.0.1:3000/admin` 可打开。
- `http://127.0.0.1:3000/api/health` 返回 `ok: true`。
- 舞监切换阶段后，观众端同步变化。
- 至少完成一次选择题提交，后台能看到答案。
- 无 `DEEPSEEK_API_KEY` 时，交互 3 仍能使用 fallback。

## 现场发布建议

- 局域网演出优先使用 `start-show.ps1`。
- 公网临时演示使用 `start-public-once.ps1 -AdminPin "至少8位口令"`。
- 公网模式结束后立即停止进程。
- 不要把真实 `server/.env`、API Key、现场答案数据提交到 GitHub。
- 如果要发布压缩包，优先从干净 clone 构建，而不是从含有本地素材和旧数据的工作目录直接打包。

## GitHub 操作

```powershell
git add .
git status --short
git commit -m "Prepare public release"
git tag v0.1.0
git push origin main --tags
```

实际分支名按你的仓库为准。提交前再次确认 `.env`、`data/` 和旧调试素材没有进入暂存区。
