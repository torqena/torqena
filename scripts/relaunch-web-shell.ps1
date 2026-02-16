$ErrorActionPreference = "Stop"

$port = 5173
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Stop existing Vite servers so dependency prebundling refreshes
try {
    $viteProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object {
            ($_.CommandLine -like "*vite*")
        }

    foreach ($proc in $viteProcesses) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
catch {
    # Best-effort cleanup
}

$viteUp = $false
try {
    Invoke-WebRequest -Uri "http://localhost:$port" -TimeoutSec 2 -UseBasicParsing | Out-Null
    $viteUp = $true
}
catch {
    $viteUp = $false
}

$viteCommand = "Set-Location `"$repoRoot`"; npx vite --force --port $port"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", $viteCommand | Out-Null
Start-Sleep -Seconds 2

Push-Location $repoRoot
$env:NODE_ENV = "development"
$env:VITE_DEV_SERVER_URL = "http://localhost:$port"
npx electron apps/desktop/electron/main.cjs
Pop-Location
