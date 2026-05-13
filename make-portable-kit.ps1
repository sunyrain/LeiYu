param(
  [string]$OutputDir = "release",
  [switch]$IncludeSource,
  [switch]$IncludeCurrentData
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Resolve-InRoot {
  param([string]$Path)
  $root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
  $combined = Join-Path $root $Path
  if (Test-Path -LiteralPath $combined) {
    $resolved = (Resolve-Path -LiteralPath $combined).Path
  } else {
    $parent = Split-Path -Parent $combined
    $resolvedParent = (Resolve-Path -LiteralPath $parent).Path
    $resolved = Join-Path $resolvedParent (Split-Path -Leaf $combined)
  }
  if (-not $resolved.StartsWith($root)) {
    throw "Refusing to use path outside workspace: $resolved"
  }
  return $resolved
}

function Copy-Path {
  param(
    [string]$From,
    [string]$To
  )

  if (-not (Test-Path -LiteralPath $From)) { return }
  $parent = Split-Path -Parent $To
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Copy-Item -LiteralPath $From -Destination $To -Recurse -Force
}

function Copy-RootFile {
  param([string]$Name)
  Copy-Path -From (Join-Path $PSScriptRoot $Name) -To (Join-Path $kitDir $Name)
}

Write-Host "Building frontend for portable kit..."
npm --prefix app run build

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'server\node_modules'))) {
  Write-Host "Installing server runtime dependencies..."
  npm --prefix server install --omit=dev
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$releaseRoot = Resolve-InRoot $OutputDir
$kitName = "fangyi-2026-portable-$timestamp"
$kitDir = Join-Path $releaseRoot $kitName
$zipPath = Join-Path $releaseRoot "$kitName.zip"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $kitDir) { Remove-Item -LiteralPath $kitDir -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Force -Path $kitDir | Out-Null

Write-Host "Copying runtime files..."

Copy-RootFile 'README.md'
Copy-RootFile 'package.json'
Copy-RootFile 'RUN_SHOW.bat'
Copy-RootFile 'start-one-click.ps1'
Copy-RootFile 'make-portable-kit.ps1'
Copy-RootFile 'start-local-only.ps1'
Copy-RootFile 'start-show.ps1'
Copy-RootFile 'start-public-once.ps1'

Copy-Path -From (Join-Path $PSScriptRoot 'docs\USAGE_AND_CONTENT.md') -To (Join-Path $kitDir 'docs\USAGE_AND_CONTENT.md')
Copy-Path -From (Join-Path $PSScriptRoot 'docs\GITHUB_RELEASE.md') -To (Join-Path $kitDir 'docs\GITHUB_RELEASE.md')
Copy-Path -From (Join-Path $PSScriptRoot 'docs\SWITCH_COMPUTER.md') -To (Join-Path $kitDir 'docs\SWITCH_COMPUTER.md')

Copy-Path -From (Join-Path $PSScriptRoot 'app\dist') -To (Join-Path $kitDir 'app\dist')

Copy-Path -From (Join-Path $PSScriptRoot 'server\src') -To (Join-Path $kitDir 'server\src')
Copy-Path -From (Join-Path $PSScriptRoot 'server\node_modules') -To (Join-Path $kitDir 'server\node_modules')
Copy-Path -From (Join-Path $PSScriptRoot 'server\package.json') -To (Join-Path $kitDir 'server\package.json')
Copy-Path -From (Join-Path $PSScriptRoot 'server\package-lock.json') -To (Join-Path $kitDir 'server\package-lock.json')
Copy-Path -From (Join-Path $PSScriptRoot 'server\.env.example') -To (Join-Path $kitDir 'server\.env.example')

New-Item -ItemType Directory -Force -Path (Join-Path $kitDir 'data') | Out-Null

if ($IncludeCurrentData) {
  Write-Host "Including current runtime data JSON files..."
  Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'data') -Filter '*.json' -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      Copy-Path -From $_.FullName -To (Join-Path $kitDir "data\$($_.Name)")
    }
}

if ($IncludeSource) {
  Write-Host "Including frontend source files..."
  Copy-Path -From (Join-Path $PSScriptRoot 'app\src') -To (Join-Path $kitDir 'app\src')
  Copy-Path -From (Join-Path $PSScriptRoot 'app\public') -To (Join-Path $kitDir 'app\public')
  Copy-Path -From (Join-Path $PSScriptRoot 'app\index.html') -To (Join-Path $kitDir 'app\index.html')
  Copy-Path -From (Join-Path $PSScriptRoot 'app\package.json') -To (Join-Path $kitDir 'app\package.json')
  Copy-Path -From (Join-Path $PSScriptRoot 'app\package-lock.json') -To (Join-Path $kitDir 'app\package-lock.json')
  Copy-Path -From (Join-Path $PSScriptRoot 'app\vite.config.js') -To (Join-Path $kitDir 'app\vite.config.js')
}

$nodeVersion = ""
try { $nodeVersion = (& node -v) } catch { $nodeVersion = "Node.js 20+ recommended" }

@"
# Fangyi 2026 portable show kit

This package is ready to run on another Windows computer.

Requirements:
- Install Node.js 20 or newer if the computer does not already have Node.
- This kit was packed with: $nodeVersion

Start the show:

```powershell
.\start-one-click.ps1 -AdminPin LeiYu2026Check
```

The launcher will:
- read the current public IPv4 from the new computer network adapter,
- generate audience/admin QR codes in data/qrcodes/,
- stop an old FY show server on port 3000 if one is already running,
- start a fresh server on 0.0.0.0:3000.

If Windows blocks scripts, run PowerShell as the current user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Do not share the admin URL or admin QR with audiences.
"@ | Set-Content -Path (Join-Path $kitDir 'PORTABLE_README.md') -Encoding UTF8

Write-Host "Creating zip..."
Compress-Archive -LiteralPath $kitDir -DestinationPath $zipPath -Force

$zipInfo = Get-Item -LiteralPath $zipPath
Write-Host ""
Write-Host "Portable kit created:"
Write-Host $zipInfo.FullName
Write-Host ("Size: {0:N1} MB" -f ($zipInfo.Length / 1MB))
Write-Host ""
Write-Host "Copy this zip to the new computer, unzip it, then run:"
Write-Host ".\start-one-click.ps1 -AdminPin LeiYu2026Check"
