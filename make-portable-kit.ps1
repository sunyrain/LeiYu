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
$macTarPath = Join-Path $releaseRoot "$kitName-macos.tar.gz"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $kitDir) { Remove-Item -LiteralPath $kitDir -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
if (Test-Path -LiteralPath $macTarPath) { Remove-Item -LiteralPath $macTarPath -Force }
New-Item -ItemType Directory -Force -Path $kitDir | Out-Null

Write-Host "Copying runtime files..."

Copy-RootFile 'README.md'
Copy-RootFile 'package.json'
Copy-RootFile 'RUN_SHOW.bat'
Copy-RootFile 'RUN_SHOW_MAC.command'
Copy-RootFile 'start-one-click.ps1'
Copy-RootFile 'start-one-click-mac.sh'
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

function Set-LfFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $text = [System.IO.File]::ReadAllText($Path)
  $text = $text -replace "`r`n", "`n"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $text, $utf8NoBom)
}

Set-LfFile (Join-Path $kitDir 'RUN_SHOW_MAC.command')
Set-LfFile (Join-Path $kitDir 'start-one-click-mac.sh')

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

$readmeTemplate = @'
# Fangyi 2026 portable show kit

This package can run on Windows or macOS. Install Node.js 20 or newer first
(https://nodejs.org/). This kit was packed with: __NODE_VERSION__

## Windows

Double-click `RUN_SHOW.bat`, or run in PowerShell:

```powershell
.\start-one-click.ps1 -AdminPin LeiYu2026Check
```

If Windows blocks scripts, run PowerShell as the current user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## macOS

The first time, open Terminal in this folder and mark the launchers executable:

```bash
chmod +x RUN_SHOW_MAC.command start-one-click-mac.sh
```

Then double-click `RUN_SHOW_MAC.command`, or run in Terminal:

```bash
./start-one-click-mac.sh --admin-pin LeiYu2026Check
```

If macOS Gatekeeper warns about an unidentified developer, right-click the
`.command` file, choose **Open**, then **Open** in the dialog. You only need
to do this once.

## What the launcher does

- detects the current public IPv4 of the host network adapter,
- generates audience/admin QR codes in `data/qrcodes/`,
- stops an old FY show server on port 3000 if one is already running,
- starts a fresh server on `0.0.0.0:3000`.

Do not share the admin URL or admin QR with audiences.
'@

$readmeText = $readmeTemplate.Replace('__NODE_VERSION__', $nodeVersion)
Set-Content -Path (Join-Path $kitDir 'PORTABLE_README.md') -Value $readmeText -Encoding UTF8

Write-Host "Creating zip..."

# Compress-Archive in Windows PowerShell 5.1 stores entry names with backslashes,
# which macOS Archive Utility refuses to expand ("cannot create directory").
# Build the zip manually so every entry uses forward slashes and is portable.
function New-PortableZip {
  param(
    [string]$SourceDir,
    [string]$ZipPath
  )

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }

  $rootName = Split-Path -Leaf $SourceDir
  $sourceFull = (Resolve-Path -LiteralPath $SourceDir).Path.TrimEnd('\','/')
  $stream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::Create)
  try {
    $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
      foreach ($file in Get-ChildItem -LiteralPath $sourceFull -Recurse -File -Force) {
        $relative = $file.FullName.Substring($sourceFull.Length).TrimStart('\','/').Replace('\','/')
        $entryName = "$rootName/$relative"
        $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try {
          $fs = [System.IO.File]::OpenRead($file.FullName)
          try { $fs.CopyTo($entryStream) } finally { $fs.Dispose() }
        } finally {
          $entryStream.Dispose()
        }
      }
    } finally {
      $zip.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

New-PortableZip -SourceDir $kitDir -ZipPath $zipPath

Write-Host "Creating macOS tar.gz..."

$tarScript = @'
import os
import sys
import tarfile

source_dir = os.path.abspath(sys.argv[1])
out_file = os.path.abspath(sys.argv[2])
root_name = os.path.basename(source_dir.rstrip(os.sep))
executable_names = {'RUN_SHOW_MAC.command', 'start-one-click-mac.sh'}

with tarfile.open(out_file, 'w:gz', format=tarfile.PAX_FORMAT) as tar:
    for current_root, dirs, files in os.walk(source_dir):
        dirs[:] = sorted(dirs)
        files = sorted(files)

        rel_dir = os.path.relpath(current_root, source_dir)
        arc_dir = root_name if rel_dir == '.' else f"{root_name}/{rel_dir.replace(os.sep, '/')}"
        dir_info = tar.gettarinfo(current_root, arcname=arc_dir)
        dir_info.mode = 0o755
        tar.addfile(dir_info)

        for name in files:
            full_path = os.path.join(current_root, name)
            rel_path = os.path.relpath(full_path, source_dir).replace(os.sep, '/')
            arcname = f"{root_name}/{rel_path}"
            info = tar.gettarinfo(full_path, arcname=arcname)
            info.mode = 0o755 if name in executable_names else 0o644
            with open(full_path, 'rb') as handle:
                tar.addfile(info, handle)
'@

$tarScript | python - $kitDir $macTarPath

$zipInfo = Get-Item -LiteralPath $zipPath
$macTarInfo = Get-Item -LiteralPath $macTarPath
Write-Host ""
Write-Host "Portable kit created:"
Write-Host $zipInfo.FullName
Write-Host ("Size: {0:N1} MB" -f ($zipInfo.Length / 1MB))
Write-Host ""
Write-Host "macOS kit created:"
Write-Host $macTarInfo.FullName
Write-Host ("Size: {0:N1} MB" -f ($macTarInfo.Length / 1MB))
Write-Host ""
Write-Host "Copy this zip to the new computer, unzip it, then run:"
Write-Host "  Windows: .\start-one-click.ps1 -AdminPin LeiYu2026Check  (or double-click RUN_SHOW.bat)"
Write-Host "  macOS:   extract the .tar.gz, then double-click RUN_SHOW_MAC.command"
