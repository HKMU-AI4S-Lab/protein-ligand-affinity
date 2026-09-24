$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
$apiFile = Join-Path $projectRoot 'backend\app.py'
$astroFile = Join-Path $projectRoot 'node_modules\astro\bin\astro.mjs'
$staticFile = Join-Path $projectRoot 'scripts\serve-static.mjs'

function Get-LabListener([int]$port) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if (!$connections.Count) { return $null }
    if ($connections.Count -ne 1 -or $connections[0].LocalAddress -ne '127.0.0.1') {
        throw "Port $port is not exclusively bound to loopback. Resolve the port conflict first."
    }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($connections[0].OwningProcess)"
    $owned = if ($port -eq 4321) {
        $processInfo.CommandLine -like "*$staticFile*"
    } else {
        $processInfo.CommandLine -like "*$apiFile*"
    }
    if (!$owned) { throw "Port $port belongs to another process. It has been left untouched." }
    return $processInfo
}
