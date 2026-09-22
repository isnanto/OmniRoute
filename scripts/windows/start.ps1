# OmniRoute — Windows Production Startup Script
#
# Gunakan script ini setiap kali OmniRoute perlu distart atau direstart di Windows.
# Script ini memastikan PORT dan env lain terset dengan benar sebelum PM2 dijalankan,
# karena Next.js standalone (server.js) membaca process.env.PORT saat proses pertama
# kali dimulai — bukan dari PM2 env injection yang datang belakangan.
#
# Cara pakai:
#   powershell -ExecutionPolicy Bypass -File C:\OmniRoute\scripts\windows\start.ps1
#
# Atau dari direktori OmniRoute:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1

param(
    [string]$Port = "20128",
    [string]$Host = "0.0.0.0",
    [string]$BuildDir = "$PSScriptRoot\..\..\..\.build\next\standalone"
)

$ErrorActionPreference = "Stop"

# Resolve build dir relatif ke lokasi script ini
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path "$ScriptDir\..\.."
$ServerJs  = Resolve-Path "$RepoRoot\.build\next\standalone\server.js"

Write-Host "[OmniRoute] Starting in production mode on port $Port ..."

# Kill proses lain yang duduki port yang sama agar tidak ada konflik
$oldPid = (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($oldPid) {
    Write-Host "[OmniRoute] Killing stale process on port ${Port} (PID $oldPid)..."
    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Set env di shell saat ini — PM2 fork_mode mewarisi env dari shell ini
$env:PORT     = $Port
$env:HOST     = $Host
$env:NODE_ENV = "production"

# Hapus instance PM2 lama dan start ulang dengan env yang benar
pm2 delete omniroute 2>$null

pm2 start $ServerJs `
    --name omniroute `
    --node-args="--max-old-space-size=2048" `
    --max-memory-restart 2500M

pm2 save

# Verifikasi
Start-Sleep -Seconds 5
$listenPid = (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($listenPid) {
    Write-Host "[OmniRoute] OK — listening on port $Port (PID $listenPid)"
} else {
    Write-Host "[OmniRoute] WARNING — port $Port tidak ditemukan, cek pm2 logs omniroute"
}
