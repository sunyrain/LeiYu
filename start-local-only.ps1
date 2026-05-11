$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "Building audience/admin frontend..."
npm --prefix app run build

Write-Host ""
Write-Host "Starting backend for this computer only..."
Write-Host "Audience URL: http://127.0.0.1:3000/"
Write-Host "Admin URL:    http://127.0.0.1:3000/admin"
Write-Host ""

$env:HOST = "127.0.0.1"
$env:PORT = "3000"
npm --prefix server start
