# --- CONFIGURATION (LIVE MODE) ---
$DomotzKey = "YOUR_DOMOTZ_API_KEY"
$DomotzEndpoint = "https://api-us-east-1-cell-1.domotz.com/public-api/v1"

$AtUsername = "your_api_user@example.com"
$AtSecret = "your_api_secret"
$AtIntegrationCode = "YOUR_INTEGRATION_CODE"
$AtZone = "webservices16" # Update to your zone
$AtBaseUrl = "https://$($AtZone).autotask.net/atservicesrest/v1.0"

$BillingMapping = @{
    "1"  = 210543  
    "8"  = 210544  
    "12" = 210545  
    "89" = 210544
}

# --- AUTHENTICATION ---
$DomotzHeaders = @{ "X-Api-Key" = $DomotzKey }
$AtAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($AtUsername):$($AtSecret)"))
$AtHeaders = @{ "Authorization" = "Basic $AtAuth"; "ApiIntegrationCode" = $AtIntegrationCode; "Content-Type" = "application/json" }

Write-Host "--- STARTING LIVE BILLING SYNC ---" -ForegroundColor Green

$Agents = Invoke-RestMethod -Uri "$DomotzEndpoint/agent" -Headers $DomotzHeaders

foreach ($Agent in $Agents) {
    Write-Host "`nProcessing: $($Agent.name)" -ForegroundColor Yellow
    
    $Devices = Invoke-RestMethod -Uri "$DomotzEndpoint/agent/$($Agent.id)/device" -Headers $DomotzHeaders
    $Counts = @{}
    foreach ($key in $BillingMapping.Keys) { $Counts[$key] = 0 }

    foreach ($Device in $Devices) {
        if ($null -ne $Device.type -and $BillingMapping.ContainsKey($Device.type.id.ToString())) {
            $Counts[$Device.type.id.ToString()]++
        }
    }

    # Match Company and Contract
    $CompanyQuery = @{ filter = @( @{ op = "eq"; field = "companyName"; value = $Agent.name } ) } | ConvertTo-Json
    $AtResponse = Invoke-RestMethod -Method Post -Uri "$AtBaseUrl/Companies/query" -Headers $AtHeaders -Body $CompanyQuery
    
    if ($AtResponse.items.Count -gt 0) {
        $AccountId = $AtResponse.items[0].id
        $ContractQuery = @{ filter = @( @{ op = "eq"; field = "accountID"; value = $AccountId }; @{ op = "eq"; field = "contractType"; value = 7 }; @{ op = "eq"; field = "status"; value = 1 } ) } | ConvertTo-Json
        $AtContract = Invoke-RestMethod -Method Post -Uri "$AtBaseUrl/Contracts/query" -Headers $AtHeaders -Body $ContractQuery

        if ($AtContract.items.Count -gt 0) {
            $ContractId = $AtContract.items[0].id

            foreach ($typeId in $Counts.Keys) {
                $ServiceId = $BillingMapping[$typeId]
                $Quantity  = $Counts[$typeId]

                # The "Small Check" to skip reporting/updating unmapped services
                if ($null -ne $ServiceId -and $ServiceId -ne "") {
                    $AdjustmentBody = @{
                        contractID = $ContractId
                        serviceID = $ServiceId
                        newUnitCount = $Quantity
                        effectiveDate = (Get-Date).ToString("yyyy-MM-dd")
                    } | ConvertTo-Json

                    Invoke-RestMethod -Method Post -Uri "$AtBaseUrl/ContractServiceAdjustments" -Headers $AtHeaders -Body $AdjustmentBody
                    Write-Host "   Updated Service $ServiceId to $Quantity units." -ForegroundColor Green
                }
            }
        }
    }
}
