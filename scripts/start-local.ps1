. "$PSScriptRoot\local-processes.ps1"
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'Run npm run build first.' }
$nodeExe = (Get-Command node -ErrorAction Stop).Source
Push-Location $projectRoot
try {
    $siteBase = & $nodeExe --input-type=module -e "import { siteBase } from './deployment.config.mjs'; console.log(siteBase);"
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the deployment base path.' }
} finally { Pop-Location }
$previewUrl = "http://127.0.0.1:4321$siteBase"
$site = Get-LabListener 4321
if (!$site) {
    Start-Process -FilePath $nodeExe -ArgumentList @(('"' + $staticFile + '"'), '4321') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'preview.log') -RedirectStandardError (Join-Path $projectRoot 'preview-error.log') | Out-Null
}
$deadline = (Get-Date).AddSeconds(45)
do {
    $ready = $false
    try {
        $page = Invoke-WebRequest $previewUrl -UseBasicParsing -TimeoutSec 2
        $ready = $page.StatusCode -eq 200 -and $page.Content -like '*UGC/FDS16/E16/23*'
    } catch { }
    if (!$ready) { Start-Sleep -Milliseconds 500 }
} until ($ready -or (Get-Date) -gt $deadline)
if (!$ready) { throw 'Local preview did not become ready. Inspect preview-error.log.' }
Get-LabListener 4321 | Out-Null
Write-Output "Production build ready: $previewUrl"
Write-Output 'Loopback only. Models run in the browser; no inference service or publication.'
