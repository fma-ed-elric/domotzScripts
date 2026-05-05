# Import-ExternalHosts.ps1
# Bulk-imports external hosts into a Domotz agent from a CSV file.

param()

$apiBaseUrl   = Read-Host "Enter Domotz API base URL (e.g., https://api-us-east-1-cell-1.domotz.com/public-api/v1)"
$agentId      = Read-Host "Enter Agent ID"
$apiKeySecure = Read-Host "Enter API Key" -AsSecureString
$csvPath      = Read-Host "Enter path to CSV file"

$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKeySecure)
$apiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if (-not (Test-Path $csvPath)) {
    Write-Error "CSV file not found: $csvPath"
    exit 1
}

$records = Import-Csv -Path $csvPath

if ($records.Count -eq 0) {
    Write-Error "CSV file is empty."
    exit 1
}

$sample = $records | Select-Object -First 1
if (-not $sample.PSObject.Properties['host'] -or -not $sample.PSObject.Properties['name']) {
    Write-Error "CSV must contain 'name' and 'host' columns."
    exit 1
}

$apiUrl  = "$($apiBaseUrl.TrimEnd('/'))/agent/$agentId/device/external-host"
$headers = @{
    "Content-Type" = "application/json"
    "X-Api-Key"    = $apiKey
}

$successCount = 0
$errors       = [System.Collections.Generic.List[string]]::new()
$timestamp    = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile      = "import_errors_agent${agentId}_${timestamp}.log"

Write-Host ""
Write-Host "Starting import for Agent ID : $agentId"
Write-Host "Endpoint                     : $apiUrl"
Write-Host "Records to process           : $($records.Count)"
Write-Host ""

foreach ($record in $records) {
    $body = @{
        host = $record.host
        name = $record.name
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $body -ErrorAction Stop | Out-Null
        Write-Host "  [OK]   $($record.name) ($($record.host))" -ForegroundColor Green
        $successCount++
    } catch {
        $errDetail = $_.Exception.Message
        Write-Host "  [FAIL] $($record.name) ($($record.host)) - $errDetail" -ForegroundColor Red
        $errors.Add("$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Agent: $agentId | Name: $($record.name) | Host: $($record.host) | Error: $errDetail")
    }
}

Write-Host ""
Write-Host "-------------------------------------------"
Write-Host "Import complete."
Write-Host "  Succeeded : $successCount"
Write-Host "  Failed    : $($errors.Count)"

if ($errors.Count -gt 0) {
    $logContent = @(
        "Domotz External Host Import - Error Report"
        "Generated  : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "Agent ID   : $agentId"
        "CSV File   : $csvPath"
        "Succeeded  : $successCount"
        "Failed     : $($errors.Count)"
        "-------------------------------------------"
        ""
    ) + $errors

    $logContent | Set-Content -Path $logFile -Encoding UTF8
    Write-Host "  Error log : $logFile" -ForegroundColor Yellow
}

Write-Host "-------------------------------------------"
