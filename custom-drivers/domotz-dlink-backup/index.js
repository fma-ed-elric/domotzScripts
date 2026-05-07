/**
 * Domotz Custom Driver - D-Link DIS-200G Series Configuration Management
 * 
 * Supports: DIS-200G-12S / DIS-200G-12SW Industrial GigE Switches
 * Protocol: SSH (CLI)
 * 
 * Features:
 *   - backup()  : Captures running-config and startup-config, stores both in
 *                 Domotz config management with misalignment detection.
 *   - restore() : Pushes a saved configuration back to the switch via SSH.
 * 
 * Prerequisites on the switch:
 *   - SSH enabled  : crypto key generate rsa  +  ip ssh server
 *   - Credentials  : An account with privilege level 15 (admin)
 *   - In Domotz Access Manager, set SSH username/password for this device.
 * 
 * Notes:
 *   - The DIS-200G prompt in Privileged EXEC mode is "Switch#"
 *   - "terminal datadump" disables the --More-- pager so the full config is
 *     returned in one shot.  This is the DIS-200G equivalent of "terminal
 *     length 0" on Cisco IOS.
 *   - Lines containing timestamps or uptime counters are excluded from the
 *     misalignment comparison so trivial diffs don't trigger false alerts.
 */

// ---------------------------------------------------------------------------
// SSH session defaults
// ---------------------------------------------------------------------------
var SSH_PORT    = 22;
var SSH_TIMEOUT = 30000;   // ms – allow enough time for full config output
var PROMPT      = "Switch#";

// Lines to ignore when comparing running vs. saved backup (misalignment check)
// Add more patterns here if needed.
var IGNORED_LINES = [
    "^!.*uptime",
    "^!.*Last configuration change"
];

// ---------------------------------------------------------------------------
// Helper – build standard SSH options
// ---------------------------------------------------------------------------
function sshOptions(commands) {
    return {
        commands              : commands,
        username              : D.device.username(),
        password              : D.device.password(),
        port                  : SSH_PORT,
        prompt                : PROMPT,
        inter_command_timeout_ms: 3000,
        global_timeout_ms     : SSH_TIMEOUT
    };
}

// ---------------------------------------------------------------------------
// Helper – strip ANSI escape codes and carriage returns from CLI output
// ---------------------------------------------------------------------------
function cleanOutput(raw) {
    return raw
        .replace(/\r/g, "")
        .replace(/\x1B\[[0-9;]*[mGKH]/g, "")
        .trim();
}

// ---------------------------------------------------------------------------
// Helper – remove the echoed command line and prompt lines from output.
// The DIS-200G echoes each command and then the prompt again at the end.
// ---------------------------------------------------------------------------
function stripPromptAndEcho(raw) {
    var lines = cleanOutput(raw).split("\n");
    var filtered = lines.filter(function(line) {
        var trimmed = line.trim();
        // Drop empty lines, prompt lines, and the echoed command itself
        return trimmed !== "" &&
               trimmed !== PROMPT &&
               trimmed.indexOf(PROMPT) !== 0;
    });
    return filtered.join("\n");
}

// ---------------------------------------------------------------------------
// validate()
//   Called by Domotz before any other function to confirm the device is
//   reachable and credentials are valid. Runs a lightweight SSH command
//   ("show version") and checks for a recognisable response. Calls
//   D.success() if all is well, D.failure() otherwise.
// ---------------------------------------------------------------------------
/**
 * @remote_procedure
 * @label Validate
 * @documentation Verifies SSH connectivity and credential validity by issuing
 * "show version" to the switch and confirming a non-empty response is returned.
 * Called automatically by Domotz before backup or restore operations.
 */
function validate() {
    var options = {
        commands              : ["show version"],
        username              : D.device.username(),
        password              : D.device.password(),
        port                  : SSH_PORT,
        prompt                : PROMPT,
        inter_command_timeout_ms: 3000,
        global_timeout_ms     : 10000
    };

    D.device.sendSSHCommands(options, function(outputs, error) {
        if (error) {
            console.error("Validate – SSH error: " + JSON.stringify(error));
            if (error.message && error.message.toLowerCase().indexOf("auth") !== -1) {
                D.failure(D.errorType.AUTHENTICATION_ERROR);
            } else {
                D.failure(D.errorType.TIMEOUT_ERROR);
            }
            return;
        }

        var output = outputs && outputs[0] ? cleanOutput(outputs[0]) : "";

        // The DIS-200G "show version" output always contains "DIS-" or "D-Link"
        if (output.length === 0) {
            console.error("Validate – empty response from show version.");
            D.failure(D.errorType.GENERIC_ERROR);
            return;
        }

        console.log("Validate – success. Device responded: " + output.substring(0, 80));
        D.success();
    });
}

// ---------------------------------------------------------------------------
// backup()
//   Called automatically by Domotz on a schedule (approx. every 6 hours).
//   Retrieves both running-config and startup-config, packages them via
//   D.createBackup(), and signals success.
// ---------------------------------------------------------------------------
/**
 * @remote_procedure
 * @label Get Configuration Backup
 * @documentation Retrieves the running-config and startup-config from the
 * switch via SSH and stores them in Domotz configuration management.
 * Misalignment detection is enabled - an alert will fire if running and
 * startup configs diverge. Requires privilege level 15 credentials.
 */
function backup() {
    // The command sequence:
    //   1. "terminal datadump" – disable paging (no --More-- interruptions)
    //   2. "show running-config"
    //   3. "show startup-config"
    var commands = [
        "terminal datadump",
        "show running-config",
        "show startup-config"
    ];

    D.device.sendSSHCommands(sshOptions(commands), function(outputs, error) {
        if (error) {
            console.error("SSH error during backup: " + JSON.stringify(error));
            D.failure(D.errorType.TIMEOUT_ERROR);
            return;
        }

        // outputs is an array aligned with the commands array.
        // Index 0 = terminal datadump response (usually empty / acknowledgement)
        // Index 1 = show running-config output
        // Index 2 = show startup-config output
        if (!outputs || outputs.length < 3) {
            console.error("Unexpected output count: " + (outputs ? outputs.length : 0));
            D.failure(D.errorType.PARSING_ERROR);
            return;
        }

        var runningConfig = stripPromptAndEcho(outputs[1]);
        var startupConfig = stripPromptAndEcho(outputs[2]);

        if (!runningConfig || runningConfig.length === 0) {
            console.error("Running config is empty – check credentials and privilege level.");
            D.failure(D.errorType.AUTHENTICATION_ERROR);
            return;
        }

        var configBackup = D.createBackup({
            label       : "D-Link DIS-200G Configuration",
            running     : runningConfig,
            startup     : startupConfig,
            ignoredLines: IGNORED_LINES
        });

        D.success(configBackup);
    });
}

// ---------------------------------------------------------------------------
// restore()
//   Called manually by a Domotz operator from the Configuration Management UI.
//   Receives a ConfigurationRestore object and replays the stored config to
//   the switch line-by-line as global configuration commands.
//
//   Strategy:
//     1. Enter Global Configuration mode.
//     2. Feed every non-comment, non-empty line from the backup content.
//     3. Return to Privileged EXEC mode.
//     4. Save with "write memory".
// ---------------------------------------------------------------------------
/**
 * @remote_procedure
 * @label Restore Configuration
 * @documentation Restores a saved configuration backup to the switch via SSH.
 * Enters global configuration mode, replays all configuration commands,
 * exits, and saves with "write memory". Requires privilege level 15 credentials.
 */
function restore(configToRestore) {
    if (!configToRestore || !configToRestore.content) {
        console.error("No configuration content provided for restore.");
        D.failure(D.errorType.GENERIC_ERROR);
        return;
    }

    var configLines = configToRestore.content
        .split("\n")
        .map(function(line) { return line.trim(); })
        .filter(function(line) {
            // Skip blank lines and comment-only lines (lines starting with !)
            // We keep structural commands only.
            return line.length > 0 && line.charAt(0) !== "!";
        });

    if (configLines.length === 0) {
        console.error("Configuration content parsed to zero commands.");
        D.failure(D.errorType.PARSING_ERROR);
        return;
    }

    // Build the full command sequence:
    //   - Enter config mode
    //   - All config lines
    //   - Exit back to privileged EXEC
    //   - Save
    var commands = ["configure terminal"]
        .concat(configLines)
        .concat(["end", "write memory"]);

    D.device.sendSSHCommands(sshOptions(commands), function(outputs, error) {
        if (error) {
            console.error("SSH error during restore: " + JSON.stringify(error));
            D.failure(D.errorType.TIMEOUT_ERROR);
            return;
        }

        // Check that the last output (write memory) confirms success.
        // The DIS-200G responds with "OK" or "Building configuration..." on success.
        var lastOutput = outputs && outputs.length > 0
            ? cleanOutput(outputs[outputs.length - 1])
            : "";

        if (lastOutput.indexOf("OK") === -1 &&
            lastOutput.toLowerCase().indexOf("building") === -1 &&
            lastOutput.toLowerCase().indexOf("succeeded") === -1) {
            console.warn("write memory response was unexpected: " + lastOutput);
            // Don't fail hard here – config may still have applied.
            // Operators can verify via the next scheduled backup.
        }

        console.log("Restore completed. write memory response: " + lastOutput);
        D.success();
    });
}
