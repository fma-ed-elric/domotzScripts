/**
 * Domotz Custom Driver
 * Name: Windows Hyper-V VM & Replication Monitor
 * Description: Monitors Hyper-V VM status and Replication Health
 * Protocol: WinRM
 */

// Production PowerShell command: Combines VM data with Replication info
var cmd = 'Get-VM | ForEach-Object { ' +
    '$repl = Get-VMReplication -VMName $_.Name -ErrorAction SilentlyContinue; ' +
    'try { ' +
        '$Kvp = Get-WmiObject -namespace root/virtualization/v2 -query ("Associators of {" + (Get-WmiObject -Namespace root/virtualization/v2 -Query "Select * From Msvm_ComputerSystem Where ElementName=`"$($_.Name)`"").path + "} Where ResultClass=Msvm_KvpExchangeComponent"); ' +
    '} catch { $Kvp = $null; } ' +
    '@{ ' +
        '"Id" = $_.Id; ' +
        '"Name" = $_.Name; ' +
        '"State" = $_.State; ' +
        '"osInfo" = $Kvp.GuestIntrinsicExchangeItems; ' +
        '"MemoryAssigned" = [math]::round($_.MemoryAssigned / 1MB, 2); ' +
        '"CPUUsage" = $_.CPUUsage; ' +
        '"Status" = $_.Status; ' +
        '"ReplicationHealth" = if ($repl) { $repl.ReplicationHealth.ToString() } else { "Not Configured" }; ' +
        '"ProcessorCount" = $_.ProcessorCount; ' +
        '"Uptime" = $_.Uptime ' +
    '} ' +
'} | ConvertTo-Json';

var winrmConfig = {
    command: cmd,
    username: D.device.username(),
    password: D.device.password()
};

var stateCodes = {
    1: 'Other', 2: 'Running', 3: 'Off', 4: 'Stopping', 5: 'Saved', 6: 'Paused',
    7: 'Starting', 8: 'Reset', 9: 'Saving', 10: 'Pausing', 11: 'Resuming',
    12: 'FastSaved', 13: 'FastSaving', 14: 'ForceShutdown', 15: 'ForceReboot',
    16: 'Hibernated', 17: 'ComponentServicing', 18: 'RunningCritical',
    19: 'OffCritical', 20: 'StoppingCritical', 21: 'SavedCritical',
    22: 'PausedCritical', 23: 'StartingCritical', 24: 'ResetCritical',
    25: 'SavingCritical', 26: 'PausingCritical', 27: 'ResumingCritical',
    28: 'FastSavedCritical', 29: 'FastSavingCritical'
};

var virtualMachineTable = D.createTable(
    'Virtual Machines',
    [
        { label: 'Name' },
        { label: 'State' },
        { label: 'OS Name' },
        { label: 'Replication Health' },
        { label: 'Memory', unit: 'MB', valueType: D.valueType.NUMBER },
        { label: 'CPU Usage', unit: '%', valueType: D.valueType.NUMBER },
        { label: 'Uptime' },
        { label: 'Status' }
    ]
);

function checkWinRmError(err) {
    if (err.message) console.error(err.message);
    if (err.code === 401) D.failure(D.errorType.AUTHENTICATION_ERROR);
    if (err.code === 404) D.failure(D.errorType.RESOURCE_UNAVAILABLE);
    D.failure(D.errorType.GENERIC_ERROR);
}

/** @remote_procedure */
function validate() {
    var validateConfig = {
        command: 'Get-VM',
        username: D.device.username(),
        password: D.device.password()
    };
    D.device.sendWinRMCommand(validateConfig, function (output) {
        if (output.error === null) {
            D.success();
        } else {
            checkWinRmError(output.error);
        }
    });
}

/** @remote_procedure */
function get_status() {
    D.device.sendWinRMCommand(winrmConfig, parseOutput);
}

function sanitize(output) {
    var recordIdReservedWords = ['\\\\?', '\\\\*', '\\\\%', 'table', 'column', 'history'];
    var recordIdSanitizationRegex = new RegExp(recordIdReservedWords.join('|'), 'g');
    return output.replace(recordIdSanitizationRegex, '').slice(0, 50).replace(/\s+/g, '-').toLowerCase();
}

function convertTotalSeconds(totalSeconds) {
    if (totalSeconds === undefined || totalSeconds === null) return "N/A";
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    return days + 'd, ' + hours + 'h, ' + minutes + 'm';
}

function parseOutput(output) {
    if (output.error === null) {
        var result = JSON.parse(output.outcome.stdout.replace(/__/g, ''));
        var listOfVMs = Array.isArray(result) ? result : [result];

        for (var k = 0; k < listOfVMs.length; k++) {
            var vm = listOfVMs[k];
            var osInfo = extractOSInfo(vm.osInfo);
            var replHealth = vm.ReplicationHealth;

            // ALERT LOGIC: Triggers a warning in Domotz logs if replication isn't Normal
            if (replHealth !== "Normal" && replHealth !== "Not Configured") {
                console.warn("REPLICATION ALERT: VM [" + vm.Name + "] is in " + replHealth + " state.");
            }

            var recordId = sanitize(vm.Id);
            virtualMachineTable.insertRecord(recordId, [
                vm.Name,
                stateCodes[vm.State] || 'Unknown',
                osInfo.osName,
                replHealth,
                vm.MemoryAssigned,
                vm.CPUUsage,
                convertTotalSeconds(vm.Uptime ? vm.Uptime.TotalSeconds : 0),
                vm.Status
            ]);
        }
        D.success(virtualMachineTable);
    } else {
        checkWinRmError(output.error);
    }
}

function extractOSInfo(xmlList) {
    var osName = 'N/A';
    if (xmlList !== null && xmlList !== undefined) {
        xmlList.forEach(function (xml) {
            var $ = D.htmlParse(xml, { xmlMode: true });
            $('PROPERTY').each(function (i, el) {
                var nameAttr = $(el).attr('NAME');
                var nameValue = $(el).find('VALUE').text();
                if (nameAttr === 'Name' && nameValue === 'OSName') {
                    osName = $(el).siblings('PROPERTY[NAME="Data"]').find('VALUE').text();
                }
            });
        });
    }
    return { osName: osName };
}
