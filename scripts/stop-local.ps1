. "$PSScriptRoot\local-processes.ps1"
foreach ($port in @(4321)) {
    $listener = Get-LabListener $port
    if ($listener) {
        Stop-Process -Id $listener.ProcessId -ErrorAction Stop
        Write-Output "Stopped lab service on port $port."
    }
}
