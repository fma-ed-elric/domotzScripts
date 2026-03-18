# Prompt for API key securely (will not appear in terminal history)
$secureKey = Read-Host -Prompt "Enter your Domotz API key" -AsSecureString
$API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
)
$BASE_URL = "https://api-us-east-1-cell-1.domotz.com/public-api/v1"

# Define user filters (adjust according to your needs)
$userFilters = @{
    deviceMake  = ""
    deviceModel = ""
    status      = ""
}

# Function to fetch agents
function Fetch-Agents {
    $response = Invoke-RestMethod -Uri "$BASE_URL/agent" -Method Get -Headers @{ "x-api-key" = $API_KEY }

    Write-Host "Agents fetched (first 5):" ($response | Select-Object -First 5 | ConvertTo-Json)
    return $response
}

# Function to flatten complex objects and prepare CSV-ready data
function Flatten-Device {
    param ($device)

    return [PSCustomObject][ordered]@{
        "id"                    = $device.id
        "display_name"          = $device.display_name
        "authentication_status" = $device.authentication_status
        "snmp_status"           = if ($device.snmp_status -eq "NOT_FOUND") { "N/A" } else { $device.snmp_status }
        "first_seen_on"         = $device.first_seen_on
        "importance"            = $device.importance
        "status"                = $device.status
        "vendor"                = $device.vendor
        "model"                 = $device.model
        "protocol"              = if ($device.protocol) { $device.protocol } else { "Unknown" }
        "agent_reachable"       = $device.agent_reachable
        "is_jammed"             = $device.is_jammed
        "tags"                  = if ($device.importance -eq "VITAL") { "Important" } else { "" }
        "site_name"             = $device.siteName
        "domotz_site_id"        = $device.domotzSiteId
        "device_id"             = $device.deviceId
        "snmp_read_community"   = if ($device.details.snmp_read_community) { $device.details.snmp_read_community } else { "N/A" }
        "snmp_write_community"  = if ($device.details.snmp_write_community) { $device.details.snmp_write_community } else { "N/A" }
        "room"                  = if ($device.details.room) { $device.details.room } else { "N/A" }
        "zone"                  = if ($device.details.zone) { $device.details.zone } else { "N/A" }
        "ip_address"            = if ($device.ip_addresses -and $device.ip_addresses.Count -gt 0) { ($device.ip_addresses -join ", ") } else { "N/A" }
        "open_ports"            = if ($device.open_ports) { "TCP: " + ($device.open_ports.tcp -join ", ") + "; UDP: " + ($device.open_ports.udp -join ", ") } else { "N/A" }
        "host_name"             = if ($device.names.host) { $device.names.host } else { "N/A" }
    }
}

# Function to generate a CSV report for devices
function Generate-CSVReport {
    param ($devices, $filePath)

    # Flatten the devices data before exporting to CSV
    $flattenedDevices = $devices | ForEach-Object { Flatten-Device $_ }

    # Convert the flattened devices to CSV format
    $flattenedDevices | Export-Csv -Path $filePath -NoTypeInformation

    Write-Host "CSV report generated at: $filePath"
}

# Function to fetch devices for a given agent
function Fetch-DevicesForAgent {
    param ($agent)

    $agentId = $agent.id
    $response = @(Invoke-RestMethod -Uri "$BASE_URL/agent/$agentId/device" -Method Get -Headers @{ "x-api-key" = $API_KEY })

    foreach ($device in $response) {
        $device | Add-Member -NotePropertyName "siteName"     -NotePropertyValue $agent.display_name -Force
        $device | Add-Member -NotePropertyName "domotzSiteId" -NotePropertyValue $agent.id           -Force
        $device | Add-Member -NotePropertyName "deviceId"     -NotePropertyValue $device.id          -Force
    }

    return $response
}

# Main function to fetch agents, devices, and generate the report
function Fetch-AndGenerateReport {
    $agents = Fetch-Agents
    $allDevices = [System.Collections.Generic.List[object]]::new()

    foreach ($agent in $agents) {
        $devices = Fetch-DevicesForAgent -agent $agent
        Write-Host "Agent '$($agent.display_name)' returned $($devices.Count) devices."
        foreach ($device in $devices) {
            $allDevices.Add($device)
        }
    }

    Write-Host "Total devices across all agents: $($allDevices.Count)"
    $filePath = Join-Path (Get-Location) "domotz_devices_report.csv"
    Generate-CSVReport -devices $allDevices -filePath $filePath
}

# Run the report generation
Fetch-AndGenerateReport
