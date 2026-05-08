# Domotz Windows Collector Uninstaller
# Handles cases where SentinelOne locks files after uninstall, causing re-installs to fail.
# Renames the leftover directory (or moves contents if rename is blocked) so a fresh install works.

$ErrorActionPreference = "Continue"
$domotzDir = "C:\Program Files (x86)\domotz"
$fallbackUninstallerPath = "$domotzDir\uninstall.exe"

Write-Host "=== Domotz Collector Uninstall ===" -ForegroundColor Cyan

# Stop the Domotz Collector service
Write-Host "`nStopping Domotz Collector service..." -ForegroundColor Yellow
Stop-Service -Name "domotzagent.exe" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$svcStatus = (Get-Service -Name "domotzagent.exe" -ErrorAction SilentlyContinue).Status
if ($svcStatus) {
    Write-Host "Service status: $svcStatus" -ForegroundColor Green
} else {
    Write-Host "Service not found - may already be removed." -ForegroundColor Yellow
}

# Kill the process if it is still running
Write-Host "`nChecking for running domotzagent process..." -ForegroundColor Yellow
Stop-Process -Name "domotzagent" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Resolve uninstaller path - prefer registry entry so Windows handles 32-bit routing correctly
Write-Host "`nLooking up uninstall string from registry..." -ForegroundColor Yellow
$regPath = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
$regEntry = Get-ChildItem $regPath -ErrorAction SilentlyContinue |
    Get-ItemProperty |
    Where-Object { $_.DisplayName -match "Domotz" } |
    Select-Object -First 1

if ($regEntry -and $regEntry.UninstallString) {
    $uninstallerPath = $regEntry.UninstallString -replace '"', ''
    Write-Host "Found registry entry: $($regEntry.DisplayName)" -ForegroundColor Green
    Write-Host "Uninstall string: $uninstallerPath" -ForegroundColor Green
} elseif (Test-Path $fallbackUninstallerPath) {
    $uninstallerPath = $fallbackUninstallerPath
    Write-Host "No registry entry found - falling back to: $uninstallerPath" -ForegroundColor Yellow
} else {
    $uninstallerPath = $null
    Write-Host "No registry entry and no uninstaller found at fallback path - skipping uninstall." -ForegroundColor Yellow
}

# Run the uninstaller
$uninstallOk = $false
if ($uninstallerPath) {
    Write-Host "`nRunning uninstaller..." -ForegroundColor Yellow
    try {
        $proc = Start-Process -FilePath $uninstallerPath -ArgumentList "/S" -Wait -PassThru -ErrorAction Stop
        Write-Host "Uninstaller exited with code: $($proc.ExitCode)" -ForegroundColor Green
        if ($proc.ExitCode -eq 0) {
            $uninstallOk = $true
        } else {
            Write-Host "Uninstaller returned a non-zero exit code - skipping directory cleanup." -ForegroundColor Red
        }
    } catch {
        Write-Host "ERROR: Failed to run uninstaller: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Skipping directory cleanup." -ForegroundColor Red
    }
}

Start-Sleep -Seconds 3

# Check for leftover directory (expected when AV locks files post-uninstall)
if (-not $uninstallOk) {
    Write-Host "`nSkipping directory cleanup due to uninstall failure." -ForegroundColor Red
    Write-Host "`n=== Done ===" -ForegroundColor Cyan
    exit 1
}

if (Test-Path $domotzDir) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $renamedDir = "C:\Program Files (x86)\domotz_old_$timestamp"
    Write-Host "`nLeftover directory detected: '$domotzDir'" -ForegroundColor Yellow
    Write-Host "Attempting rename to: '$renamedDir'" -ForegroundColor Yellow

    try {
        Rename-Item -Path $domotzDir -NewName $renamedDir -ErrorAction Stop
        Write-Host "Directory renamed. Fresh install can now proceed." -ForegroundColor Green
    } catch {
        # Rename blocked - NTFS prevents renaming a directory when child files are exclusively locked.
        # Fall back to robocopy /MOVE to relocate whatever is accessible.
        Write-Host "Rename blocked (likely AV file lock): $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Falling back to robocopy to move accessible files..." -ForegroundColor Yellow

        $null = New-Item -ItemType Directory -Path $renamedDir -Force
        robocopy $domotzDir $renamedDir /E /MOVE /R:0 /W:0 | Out-Null

        $remaining = Get-ChildItem $domotzDir -Recurse -ErrorAction SilentlyContinue
        if ($remaining) {
            Write-Host "The following files are still locked and could not be moved:" -ForegroundColor Yellow
            $remaining | ForEach-Object { Write-Host "  $($_.FullName)" -ForegroundColor Yellow }
            Write-Host "These files remain locked (likely by AV). The installer may overwrite them once locks release." -ForegroundColor Cyan
        } else {
            Remove-Item $domotzDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "All files moved. Fresh install can now proceed." -ForegroundColor Green
        }
    }
} else {
    Write-Host "`nNo leftover directory found. Uninstall appears clean." -ForegroundColor Green
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
