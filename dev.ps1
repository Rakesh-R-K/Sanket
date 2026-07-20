#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $root 'api'
$appDir = Join-Path $root 'app'
$venvPython = Join-Path $apiDir '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython) -or -not (Test-Path (Join-Path $appDir 'node_modules'))) {
    throw 'Install the API and app dependencies first. See README.md.'
}

Push-Location $apiDir
try {
    & $venvPython -m app.seed
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the database.' }
} finally {
    Pop-Location
}

$backend = $null
$frontend = $null
try {
    Write-Host 'Starting API at http://127.0.0.1:8000 and app at http://127.0.0.1:5173'
    $backend = Start-Process -FilePath $venvPython -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $apiDir -PassThru -NoNewWindow
    $frontend = Start-Process -FilePath 'node' -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $appDir -PassThru -NoNewWindow
    while (-not $backend.HasExited -and -not $frontend.HasExited) { Start-Sleep -Milliseconds 300 }
} finally {
    foreach ($proc in @($backend, $frontend)) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
        }
    }
}
