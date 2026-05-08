# Simulates SentinelOne-style file locking on agent.log for testing the uninstall script.
# Opens an exclusive lock on the file and holds it until a key is pressed.

$filePath = "C:\Program Files (x86)\domotz\agent.log"

if (-not (Test-Path $filePath)) {
    Write-Host "File not found: '$filePath'" -ForegroundColor Yellow
    Write-Host "Creating empty file to lock..." -ForegroundColor Yellow
    New-Item -ItemType File -Path $filePath -Force | Out-Null
}

try {
    $fileStream = [System.IO.File]::Open(
        $filePath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    Write-Host "File locked: '$filePath'" -ForegroundColor Green
    Write-Host "Press any key to release the lock..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    $fileStream.Close()
    $fileStream.Dispose()
    Write-Host "Lock released." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Could not lock file." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
