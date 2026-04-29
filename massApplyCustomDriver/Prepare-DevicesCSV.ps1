# Domotz API variables
Write-Host "Select your Domotz API region:"
Write-Host "  1) US  - api-us-east-1-cell-1.domotz.com"
Write-Host "  2) EU  - api-eu-west-1-cell-1.domotz.com"
$regionChoice = Read-Host "Enter choice (1/2)"
switch ($regionChoice) {
    "1" { $apiUrl = "https://api-us-east-1-cell-1.domotz.com/public-api/v1/" }
    "2" { $apiUrl = "https://api-eu-west-1-cell-1.domotz.com/public-api/v1/" }
    default {
        Write-Host "Invalid choice. Defaulting to US endpoint."
        $apiUrl = "https://api-us-east-1-cell-1.domotz.com/public-api/v1/"
    }
}
$apiKeySecure = Read-Host "Enter your Domotz API Key" -AsSecureString
$apiKey = [System.Net.NetworkCredential]::new("", $apiKeySecure).Password

# Filters
$siteNames        = Read-Host "Enter site names separated by commas (Leave empty for all sites)"
$deviceType       = Read-Host "Enter device type (Leave empty to skip)"
$deviceMake       = Read-Host "Enter device make (Leave empty to skip)"
$deviceModel      = Read-Host "Enter device model (Leave empty to skip)"
$firmwareVersion  = Read-Host "Enter firmware version (Leave empty to skip)"
$filterAgentStatus  = Read-Host "Filter agents/sites by status? (online/offline, leave empty for all)"
$filterDeviceStatus = Read-Host "Filter devices by status? (online/offline, leave empty for all)"
$filterSNMPStatus   = Read-Host "Enter SNMP Status (AUTHENTICATED, NOT_AUTHENTICATED, or leave empty to skip)"
$filterAuthStatus   = Read-Host "Enter Authentication Status (Leave empty to skip)"

# API helper
function Invoke-DomotzAPI {
    param ([string]$endpoint, [string]$method = "GET")
    $headers = @{ "x-api-key" = $apiKey }
    return Invoke-RestMethod -Uri "$apiUrl$endpoint" -Method $method -Headers $headers
}

# Step 1: Retrieve all agents with pagination
Write-Host "Retrieving all agents/sites..."
$agents = @()
$pageSize = 100
$pageNumber = 0
do {
    $response = Invoke-DomotzAPI "agent?page_size=$pageSize&page_number=$pageNumber"
    $agents += $response
    $pageNumber++
} while ($response.Count -eq $pageSize)

$filteredAgents = $agents | Where-Object {
    ($siteNames -eq "" -or ($siteNames -split ",").Trim() -contains $_.display_name) -and
    ($filterAgentStatus -eq "" -or $_.status.value -eq $filterAgentStatus)
}

# Step 2: Retrieve devices for each agent
$devices = @()
foreach ($agent in $filteredAgents) {
    Write-Host "Retrieving devices for site: $($agent.display_name)..."
    $agentDevices = Invoke-DomotzAPI "agent/$($agent.id)/device"
    foreach ($device in $agentDevices) {
        $device | Add-Member -MemberType NoteProperty -Name "agent_id" -Value $agent.id -Force
    }
    $devices += $agentDevices
}

# Step 3: Apply filters
$filteredDevices = $devices | Where-Object {
    ($deviceType      -eq "" -or $_.type.label              -eq $deviceType) -and
    ($deviceMake      -eq "" -or $_.user_data.vendor         -eq $deviceMake) -and
    ($deviceModel     -eq "" -or $_.user_data.model          -eq $deviceModel) -and
    ($firmwareVersion -eq "" -or $_.details.firmware_version -eq $firmwareVersion) -and
    ($filterSNMPStatus  -eq "" -or $_.snmp_status            -eq $filterSNMPStatus) -and
    ($filterAuthStatus  -eq "" -or $_.authentication_status  -eq $filterAuthStatus) -and
    ($filterDeviceStatus -eq "" -or $_.status               -eq $filterDeviceStatus)
}

Write-Host "$($filteredDevices.Count) device(s) matched your filters."

if ($filteredDevices.Count -eq 0) {
    Write-Host "No devices found. Exiting."
    Read-Host "Press Enter to exit"
    exit
}

# Step 4: Select custom driver
Write-Host "`nRetrieving available custom drivers..."
$drivers = Invoke-DomotzAPI "custom-driver"

if (-not $drivers -or $drivers.Count -eq 0) {
    Write-Host "No custom drivers found in your account. Exiting."
    Read-Host "Press Enter to exit"
    exit
}

Write-Host "`nAvailable Custom Drivers:"
$drivers | ForEach-Object { Write-Host "  ID: $($_.id)  |  Name: $($_.name)" }

$selectedDriverId = Read-Host "`nEnter the Driver ID to apply"
$selectedDriver = $drivers | Where-Object { $_.id -eq $selectedDriverId }

if (-not $selectedDriver) {
    Write-Host "Driver ID '$selectedDriverId' not found. Exiting."
    Read-Host "Press Enter to exit"
    exit
}

Write-Host "Selected driver: $($selectedDriver.name)"

# Step 5: Sample period
$samplePeriod = Read-Host "Enter sample period (5m, 10m, 15m, 30m, 1hr, 2hr, 6hr, 12hr, 24hr - leave empty for default 30m)"
if ($samplePeriod -eq "") { $samplePeriod = "30m" }

# Step 6: Credentials
Write-Host "`nDoes this driver require credentials?"
Write-Host "  1) No - leave blank"
Write-Host "  2) Yes, same for all devices"
Write-Host "  3) Yes, different per device"
$credChoice = Read-Host "Enter choice (1/2/3)"

$globalUsername = ""
$globalPassword = ""

if ($credChoice -eq "2") {
    $globalUsername = Read-Host "Enter username"
    $globalPassword = Read-Host "Enter password"
}

# Step 7: Build Devices.csv
$csvRows = $filteredDevices | ForEach-Object {
    $username = ""
    $password = ""

    if ($credChoice -eq "2") {
        $username = $globalUsername
        $password = $globalPassword
    } elseif ($credChoice -eq "3") {
        $deviceName = if ($_.user_data.name) { $_.user_data.name } else { $_.display_name }
        $username = Read-Host "Username for '$deviceName' (ID: $($_.id))"
        $password = Read-Host "Password for '$deviceName' (ID: $($_.id))"
    }

    [PSCustomObject]@{
        device_id     = $_.id
        agent_id      = $_.agent_id
        driver_id     = $selectedDriverId
        username      = $username
        password      = $password
        sample_period = $samplePeriod
    }
}

$csvPath = ".\Devices.csv"
$csvRows | Export-Csv -Path $csvPath -NoTypeInformation
Write-Host "`nDevices.csv written with $($csvRows.Count) row(s)."

# Step 8: Optionally run MassApplyScripts.ps1
$runNow = Read-Host "Run MassApplyScripts.ps1 now? (yes/no)"
if ($runNow -eq "yes") {
    & ".\MassApplyScripts.ps1"
} else {
    Write-Host "Done. Review Devices.csv and run MassApplyScripts.ps1 when ready."
    Write-Host "Press any key to exit..."
    [void][System.Console]::ReadKey($true)
}
