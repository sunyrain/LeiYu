param(
  [Parameter(Mandatory = $true)]
  [string]$AdminPin
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if ($AdminPin.Length -lt 8) {
  throw "Use an admin PIN with at least 8 characters for public mode."
}

$publicIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.IPAddress -notlike '169.254.*' -and
    $_.IPAddress -notmatch '^10\.' -and
    $_.IPAddress -notmatch '^192\.168\.' -and
    $_.IPAddress -notmatch '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
  } |
  Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $publicIp) {
  throw "No public IPv4 address was found on this computer."
}

Write-Host "Building audience/admin frontend..."
npm --prefix app run build

Write-Host ""
Write-Host "Starting ONE-TIME PUBLIC show backend..."
Write-Host "Audience URL: http://${publicIp}:3000/"
Write-Host "Admin URL:    http://${publicIp}:3000/admin?pin=${AdminPin}"
Write-Host ""
Write-Host "Do not share the admin URL. Stop this process immediately after the show."
Write-Host ""

$env:HOST = "0.0.0.0"
$env:PORT = "3000"
$env:ADMIN_PIN = $AdminPin
npm --prefix server start
