# --- Configuration ---
# Set your parameters here
$ActivationKey = "YOUR_DOMOTZ_API_KEY"
$ApiEndpoint  = "https://api-us-east-1-cell-1.domotz.com/public-api/v1/" # Or your specific region
$AgentName     = "My-New-Domotz-Agent"

$AgentUrl = "https://portal.domotz.com/download/agent_packages/domotz-windows-x64-10.exe"
$WindowsAgentInstallerFile = "$PSScriptRoot\domotz-windows-x64-10.exe"
$WindowsAgentInstallerDir  = $PSScriptRoot

$StatusUrl     = "http://127.0.0.1:3000/api/v1/status"
$ActivationUrl = "http://127.0.0.1:3000/api/v1/agent"

# --- 1. Prepare Payload ---
$ActivationHeaders = @{ "X-API-Key" = $ActivationKey }
$ActivationBody = @{
    "name"     = $AgentName
    "endpoint" = $ApiEndpoint
} | ConvertTo-Json

# --- 2. Administrative Privilege Check ---
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Insufficient permissions. Please run as Administrator."
    exit 1
}

# --- 3. Download Domotz Agent Installer ---
try {
    Write-Host "Downloading agent from $AgentUrl..." -ForegroundColor Cyan
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($AgentUrl, $WindowsAgentInstallerFile)
} catch {
    Write-Error "Failed to download the installer: $($_.Exception.Message)"
    exit 1
}

# --- 4. Install the Domotz Agent ---
Write-Host "Executing installer: $WindowsAgentInstallerFile" -ForegroundColor Cyan
# /S for Silent, /W for Wait, /D for Directory
Start-Process -FilePath $WindowsAgentInstallerFile -WorkingDirectory $WindowsAgentInstallerDir -ArgumentList "/W /S /D=`"C:\Program Files (x86)\domotz\`"" -Wait

# Verify process is running
$IsInstalled = $false
$RetryLimit = 20
$Counter = 0
do {
    if (Get-Process domotzagent -ErrorAction SilentlyContinue) {
        $IsInstalled = $true
        Write-Host "Process 'domotzagent' detected." -ForegroundColor Green
    } else {
        Write-Host "Waiting for process to start ($($Counter)/$($RetryLimit))..."
        Start-Sleep -s 3
        $Counter++
    }
} while (-not $IsInstalled -and $Counter -lt $RetryLimit)

# --- 5. Wait for local API to stabilize ---
$IsRunning = $false
Write-Host "Waiting for local API to initialize at $StatusUrl..." -ForegroundColor Cyan
do {
    try {
        $null = Invoke-RestMethod -Uri $StatusUrl -Method Get -ErrorAction Stop
        $IsRunning = $true
        Write-Host "API is responding. Waiting 5 seconds for backend stabilization..." -ForegroundColor Green
        Start-Sleep -s 5 # This 'settle' time prevents connection resets during activation
    } catch {
        Write-Host "Service not ready yet. Retrying..."
        Start-Sleep -s 3
    }
} while ($IsRunning -eq $false)

# --- 6. Activate Agent ---
try {
    Write-Host "Attempting activation for: $AgentName" -ForegroundColor Cyan
    Invoke-RestMethod -Uri $ActivationUrl -Method Post -Headers $ActivationHeaders -ContentType "application/json" -Body $ActivationBody
    Write-Host "Agent successfully activated!" -ForegroundColor Green
} catch {
    Write-Host "--- ACTIVATION FAILED ---" -ForegroundColor Red

    # DEFENSIVE CHECK: This prevents the 'null-valued expression' crash if the connection is reset
    if ($_.Exception.Response) {
        $StatusCode = [int]$_.Exception.Response.StatusCode
        $Stream = $_.Exception.Response.GetResponseStream()
        $Reader = New-Object System.IO.StreamReader($Stream)
        $BodyError = $Reader.ReadToEnd()
        
        Write-Host "HTTP Status: $StatusCode"
        Write-Host "Agent Message: $BodyError"
    } else {
        # This handles cases where the local service drops the connection abruptly
        Write-Host "Connection Error: $($_.Exception.Message)"
        Write-Host "The service likely terminated the connection before sending a response." -ForegroundColor Yellow
    }
    exit 1
}
