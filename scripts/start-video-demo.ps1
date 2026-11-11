[CmdletBinding()]
param(
    [switch]$UseManualQaData,
    [string]$DataDirectory,
    [string]$PythonPath,
    [ValidateRange(1024, 65535)]
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot

if ($UseManualQaData -and $DataDirectory) {
    throw 'Choose either -UseManualQaData or -DataDirectory.'
}

if (-not $PythonPath) {
    $localPython = Join-Path $repositoryRoot '.medgemma-venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $localPython -PathType Leaf) {
        $PythonPath = $localPython
    } else {
        $pythonCommand = Get-Command python -ErrorAction Stop
        $PythonPath = $pythonCommand.Source
    }
}
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw 'Python was not found. Provide -PythonPath with the path to python.exe.'
}

if (-not $DataDirectory) {
    $demoFolder = if ($UseManualQaData) { '.private-data\manual-qa' } else { '.private-data\video-demo' }
    $DataDirectory = Join-Path $repositoryRoot $demoFolder
} elseif (-not [System.IO.Path]::IsPathRooted($DataDirectory)) {
    $DataDirectory = Join-Path $repositoryRoot $DataDirectory
}
$DataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
    $listener.Start()
} catch {
    throw "Local port $Port is already in use. Stop the existing Aarogya server in its terminal, or use -Port 8001."
} finally {
    $listener.Stop()
}

$previousDataDirectory = [Environment]::GetEnvironmentVariable('AAROGYA_DATA_DIR', 'Process')
$previousSecret = [Environment]::GetEnvironmentVariable('AAROGYA_SESSION_SECRET', 'Process')
$sessionBytes = New-Object byte[] 48
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $random.GetBytes($sessionBytes)
} finally {
    $random.Dispose()
}

try {
    $env:AAROGYA_DATA_DIR = $DataDirectory
    $env:AAROGYA_SESSION_SECRET = [Convert]::ToBase64String($sessionBytes)
    Write-Host 'Starting synthetic-data video demo with Jitsi meetings.'
    Write-Host 'Use fictional patient details only. Do not share real health information.'
    Write-Host "Data directory: $DataDirectory"
    Write-Host "Open http://127.0.0.1:$Port and sign in with an account in that data directory."
    Write-Host 'The doctor opens the generated Jitsi room in a separate tab and signs in to start it.'
    Write-Host 'Press Ctrl+C to stop this local application server.'
    & $PythonPath (Join-Path $repositoryRoot 'app.py') --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) {
        throw "The application server exited with code $LASTEXITCODE."
    }
} finally {
    [Environment]::SetEnvironmentVariable('AAROGYA_DATA_DIR', $previousDataDirectory, 'Process')
    [Environment]::SetEnvironmentVariable('AAROGYA_SESSION_SECRET', $previousSecret, 'Process')
}
