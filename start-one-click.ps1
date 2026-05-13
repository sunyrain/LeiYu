param(
  [string]$PublicIp = "",
  [string]$AdminPin = "",
  [int]$Port = 3000,
  [int]$QrSize = 512,
  [switch]$UseExternalIp,
  [switch]$KeepExisting,
  [switch]$NoBuild,
  [switch]$NoQr,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Test-PrivateIPv4 {
  param([string]$Ip)

  return (
    $Ip -match '^10\.' -or
    $Ip -match '^192\.168\.' -or
    $Ip -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
  )
}

function New-AdminPin {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
  return -join (1..16 | ForEach-Object { $chars[(Get-Random -Minimum 0 -Maximum $chars.Length)] })
}

function Get-LocalPublicIPv4 {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      -not (Test-PrivateIPv4 $_.IPAddress)
    } |
    Select-Object -First 1 -ExpandProperty IPAddress

  return $ip
}

function Get-PrivateIPv4 {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      (Test-PrivateIPv4 $_.IPAddress)
    } |
    Sort-Object @{ Expression = { if ($_.IPAddress -eq '192.168.137.1') { 0 } else { 1 } } }, InterfaceAlias |
    Select-Object -First 1 -ExpandProperty IPAddress

  return $ip
}

function Get-ExternalIPv4 {
  try {
    return (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 5).Trim()
  } catch {
    return ""
  }
}

function Resolve-DisplayIp {
  if ($PublicIp) {
    return [pscustomobject]@{ Ip = $PublicIp.Trim(); Source = "manual -PublicIp" }
  }
  if ($env:PUBLIC_IP) {
    return [pscustomobject]@{ Ip = $env:PUBLIC_IP.Trim(); Source = "PUBLIC_IP environment variable" }
  }

  if (-not $UseExternalIp) {
    $localPublic = Get-LocalPublicIPv4
    if ($localPublic) {
      return [pscustomobject]@{ Ip = $localPublic; Source = "local public network adapter" }
    }
  }

  $external = Get-ExternalIPv4
  if ($external) {
    return [pscustomobject]@{ Ip = $external; Source = "external public IP lookup" }
  }

  if ($UseExternalIp) {
    $localPublic = Get-LocalPublicIPv4
    if ($localPublic) {
      return [pscustomobject]@{ Ip = $localPublic; Source = "local public network adapter fallback" }
    }
  }

  $private = Get-PrivateIPv4
  if ($private) {
    return [pscustomobject]@{ Ip = $private; Source = "private LAN adapter fallback" }
  }

  throw "No usable IPv4 address was found. You can pass one explicitly, for example: .\start-one-click.ps1 -PublicIp 183.172.12.24"
}

function Save-TextQrCode {
  param(
    [string]$Text,
    [string]$OutFile,
    [int]$Size
  )

  $encoded = [System.Uri]::EscapeDataString($Text)
  $apiUrl = "https://api.2dcode.biz/v1/create-qr-code?data=${encoded}&size=${Size}x${Size}&format=png&error_correction=H&border=2"
  Invoke-WebRequest -UseBasicParsing -Uri $apiUrl -OutFile $OutFile -TimeoutSec 20
  return $apiUrl
}

function Get-PortListeners {
  param([int]$ListenPort)

  $rows = @()
  $pattern = "^\s*TCP\s+(.+):${ListenPort}\s+\S+\s+LISTENING\s+(\d+)\s*$"
  foreach ($line in (& netstat -ano -p tcp)) {
    if ($line -match $pattern) {
      $pidValue = [int]$Matches[2]
      $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
      $rows += [pscustomobject]@{
        Address = $Matches[1].Trim()
        Port = $ListenPort
        Pid = $pidValue
        ProcessName = if ($process) { $process.ProcessName } else { "" }
        Path = if ($process) { $process.Path } else { "" }
      }
    }
  }

  return $rows
}

function Get-LocalHealth {
  param([int]$HealthPort)

  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:${HealthPort}/api/health" -TimeoutSec 3
  } catch {
    return $null
  }
}

$display = Resolve-DisplayIp
$displayIp = $display.Ip
$ipSource = $display.Source
if (-not $AdminPin) {
  $AdminPin = if ($env:ADMIN_PIN) { $env:ADMIN_PIN } else { New-AdminPin }
}

if ($AdminPin.Length -lt 8) {
  throw "AdminPin must be at least 8 characters."
}

$audienceUrl = "http://${displayIp}:${Port}/"
$adminUrl = "http://${displayIp}:${Port}/admin?pin=${AdminPin}"
$qrDir = Join-Path $PSScriptRoot 'data\qrcodes'
$audienceQr = Join-Path $qrDir 'audience.png'
$adminQr = Join-Path $qrDir 'admin.png'
$urlsFile = Join-Path $qrDir 'show-urls.txt'

if (-not $NoBuild) {
  Write-Host "Building audience/admin frontend..."
  npm --prefix app run build
}

$audienceQrApi = ""
$adminQrApi = ""
if (-not $NoQr) {
  New-Item -ItemType Directory -Force -Path $qrDir | Out-Null
  Write-Host "Generating QR codes with cli.im API..."
  $audienceQrApi = Save-TextQrCode -Text $audienceUrl -OutFile $audienceQr -Size $QrSize
  $adminQrApi = Save-TextQrCode -Text $adminUrl -OutFile $adminQr -Size $QrSize

  @(
    "Audience URL: $audienceUrl",
    "Admin URL:    $adminUrl",
    "Audience QR:  $audienceQr",
    "Admin QR:     $adminQr",
    "Audience QR API: $audienceQrApi",
    "Admin QR API:    $adminQrApi"
  ) | Set-Content -Path $urlsFile -Encoding UTF8
}

Write-Host ""
Write-Host "FY show service is ready."
Write-Host "Running IP:   $displayIp"
Write-Host "IP source:    $ipSource"
Write-Host "Bind address: 0.0.0.0:${Port}"
Write-Host "Audience URL: $audienceUrl"
Write-Host "Admin URL:    $adminUrl"
if (-not $NoQr) {
  Write-Host "Audience QR:  $audienceQr"
  Write-Host "Admin QR:     $adminQr"
  Write-Host "URL record:   $urlsFile"
}
Write-Host ""
Write-Host "Do not share the admin URL or admin QR with audiences."
Write-Host "Press Ctrl+C in this window to stop the service."
Write-Host ""

if ($NoStart) {
  Write-Host "NoStart was set, so the backend was not started."
  exit 0
}

$listeners = @(Get-PortListeners -ListenPort $Port)
if ($listeners.Count -gt 0) {
  $health = Get-LocalHealth -HealthPort $Port
  $listenerText = ($listeners | ForEach-Object { "$($_.ProcessName) PID $($_.Pid) on $($_.Address):$($_.Port)" }) -join "; "

  if ($KeepExisting -and $health -and $health.ok) {
    Write-Host "Port ${Port} is already occupied by a running FY show server: $listenerText"
    Write-Host "KeepExisting was set. The service is already available at the URLs printed above."
    exit 0
  }

  if ($health -and $health.ok) {
    Write-Host "Port ${Port} is already in use: $listenerText"
    Write-Host "Stopping the existing FY show server before starting a fresh one..."
    $listeners | Select-Object -ExpandProperty Pid -Unique | ForEach-Object {
      Stop-Process -Id $_ -Force
    }
    Start-Sleep -Seconds 1
    $listeners = @(Get-PortListeners -ListenPort $Port)
    if ($listeners.Count -gt 0) {
      throw "Port ${Port} is still in use after restart attempt. Close the process manually and run this script again."
    }
  } else {
    throw "Port ${Port} is already in use by another process: $listenerText. Stop it first or use a different -Port."
  }
}

$env:HOST = "0.0.0.0"
$env:PORT = [string]$Port
$env:ADMIN_PIN = $AdminPin
npm --prefix server start
