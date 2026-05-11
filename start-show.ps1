param(
  [string]$HostIp = ""
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

function Get-ShowHostIp {
  if ($HostIp) {
    if (-not (Test-PrivateIPv4 $HostIp)) {
      throw "Refusing to bind to public IP $HostIp. Use a private LAN IP such as 192.168.137.1."
    }
    return $HostIp
  }

  $privateIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      (Test-PrivateIPv4 $_.IPAddress)
    } |
    Sort-Object @{ Expression = { if ($_.IPAddress -eq '192.168.137.1') { 0 } else { 1 } } }, InterfaceAlias

  $selected = $privateIps | Select-Object -First 1
  if (-not $selected) {
    throw @"
No private LAN IP was found.

For a closed onsite show:
1. Open Windows Settings > Network & internet > Mobile hotspot.
2. Turn Mobile hotspot on.
3. Connect audience phones to that hotspot.
4. Run this script again.

Expected audience URL after hotspot is usually:
http://192.168.137.1:3000/
"@
  }

  return $selected.IPAddress
}

$displayHost = Get-ShowHostIp
$bindHost = $displayHost

Write-Host "Building audience/admin frontend..."
npm --prefix app run build

Write-Host ""
Write-Host "Starting show backend on private LAN only..."
Write-Host "Audience URL: http://${displayHost}:3000/"
Write-Host "Admin URL:    http://${displayHost}:3000/admin"
Write-Host ""

$env:HOST = $bindHost
$env:PORT = "3000"
npm --prefix server start
