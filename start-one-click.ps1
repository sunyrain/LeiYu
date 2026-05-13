param(
  [string]$PublicIp = "",
  [string]$AdminPin = "",
  [int]$Port = 3000,
  [int]$QrSize = 512,
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
  if ($PublicIp) { return $PublicIp.Trim() }
  if ($env:PUBLIC_IP) { return $env:PUBLIC_IP.Trim() }

  $external = Get-ExternalIPv4
  if ($external) { return $external }

  $localPublic = Get-LocalPublicIPv4
  if ($localPublic) { return $localPublic }

  $private = Get-PrivateIPv4
  if ($private) { return $private }

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

$displayIp = Resolve-DisplayIp
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
Write-Host "IP source:    realtime public IP detection, unless -PublicIp or PUBLIC_IP was provided"
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

$env:HOST = "0.0.0.0"
$env:PORT = [string]$Port
$env:ADMIN_PIN = $AdminPin
npm --prefix server start
