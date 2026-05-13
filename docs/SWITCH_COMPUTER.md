# 换电脑运行指南

## 1. 在当前电脑打包

```powershell
.\make-portable-kit.ps1
```

生成的包会放在 `release/` 目录，例如：

```text
release/fangyi-2026-portable-YYYYMMDD-HHMMSS.zip
release/fangyi-2026-portable-YYYYMMDD-HHMMSS-macos.tar.gz
```

这个包包含：

- 已构建好的前端 `app/dist`
- 后端代码 `server/src`
- 后端运行依赖 `server/node_modules`
- 一键启动脚本 `start-one-click.ps1`
- 使用文档

默认不包含现场运行数据和观众提交数据。需要连同当前 `data/*.json` 一起带走时：

```powershell
.\make-portable-kit.ps1 -IncludeCurrentData
```

需要把前端源码也带走，方便在新电脑上继续改代码时：

```powershell
.\make-portable-kit.ps1 -IncludeSource
```

## 2. 在新电脑准备

新电脑需要安装 Node.js 20 或更新版本。安装完成后，在 PowerShell 里确认：

```powershell
node -v
npm -v
```

如果 Windows 不允许运行 `.ps1` 脚本，执行一次：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 3. 在新电脑启动

Windows 使用 `.zip`。macOS 优先使用 `-macos.tar.gz`，它会保留 `.command` 启动文件的可执行权限。

解压包，进入解压后的目录。

Windows 最稳妥的方式是双击：

```text
RUN_SHOW.bat
```

macOS 最稳妥的方式是双击：

```text
RUN_SHOW_MAC.command
```

这些入口会自动处理平台上的启动细节，并且如果启动失败会停在窗口里显示错误。

也可以手动在 PowerShell 里运行：

```powershell
.\start-one-click.ps1 -AdminPin LeiYu2026Check
```

脚本会自动：

- 读取新电脑当前公网网卡 IP
- 生成观众端二维码和后台二维码
- 如果 `3000` 端口已有旧服务，先停止旧服务
- 启动新的观众端和后台服务

二维码位置：

```text
data/qrcodes/audience.png
data/qrcodes/admin.png
```

地址记录：

```text
data/qrcodes/show-urls.txt
```

不要把 admin 地址或 admin 二维码发给观众。
