/**
 * Domotz Custom Driver
 * Name: Hirschmann HiOS - Configuration Backup
 * Description: Backs up the running configuration of Hirschmann HiOS switches
 *              via SSH using "show running-config script".
 *
 * Tested on:
 *   - Hirschmann Greyhound GRS1042 (HiOS-3A-09.0.02)
 *   - Hirschmann Bobcat BRS20      (HiOS-2S-09.0.02)
 *
 * Prerequisites:
 *   - SSH enabled on the device
 *   - Enable password must be blank/disabled (no "enable" password set)
 *   - Device credentials set in Domotz Custom Driver Management
 *
 * Communication: SSH (port 22)
 */

// HiOS prompt regex: matches "(GRS)>" or "(BRS)#" etc.
// Confirmed format: abbreviated model name in parentheses, NO space, then > or #
// Examples: (GRS)>  (GRS)#  (BRS)>  (BRS)#
var PROMPT_REGEX = "\\([^)]+\\)[>#]";

// Lines to ignore when Domotz compares configs for drift detection.
// These values change on every collection and would cause false drift alerts.
var IGNORED_LINES = [
    // System uptime counter
    "^.*sysUpTime.*$",
    // Any line containing only whitespace
    "^\\s*$"
];

/**
 * Strips the echoed command and trailing prompt from SSH output,
 * leaving only the config body.
 *
 * HiOS echoes the command on the first line and ends with a prompt line.
 * Example raw output:
 *   show running-config script\r\n
 *   !Hirschmann ...\n
 *   ...\n
 *   (GRS1042) #
 */
function cleanOutput(raw) {
    var lines = raw.split(/\r?\n/);
    var result = [];
    var started = false;
    var promptPattern = /^\([^)]+\)[>#]/;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Skip the echoed command line (first non-empty line before config starts)
        if (!started) {
            if (line.indexOf("show running-config") !== -1) {
                started = true;
            }
            continue;
        }

        // Stop at the trailing prompt line
        if (promptPattern.test(line.trim())) {
            break;
        }

        result.push(line);
    }

    return result.join("\n").trim();
}

/**
 * Main backup function.
 * Uses sendSSHCommands to run a sequence:
 *   1. enable          → escalate to Privileged Exec (no password required)
 *   2. cli numlines 0  → disable pager so output is not interrupted
 *   3. show running-config script → capture the config
 */
function backup() {
    var sshOptions = {
        username: D.device.username(),
        password: D.device.password(),
        // prompt_regex covers both User Exec (>) and Privileged Exec (#)
        // with any device name in parentheses
        prompt_regex: PROMPT_REGEX,
        commands: [
            "enable",
            "cli numlines 0",
            "show running-config script"
        ],
        inter_command_timeout_ms: 5000,
        global_timeout_ms: 60000
    };

    D.device.sendSSHCommands(sshOptions, function (outputs, error) {
        if (error) {
            console.error("SSH error: " + JSON.stringify(error));

            if (error.message && error.message.toLowerCase().indexOf("auth") !== -1) {
                D.failure(D.errorType.AUTHENTICATION_ERROR);
            } else if (error.message && error.message.toLowerCase().indexOf("timeout") !== -1) {
                D.failure(D.errorType.TIMEOUT_ERROR);
            } else {
                D.failure(D.errorType.GENERIC_ERROR);
            }
            return;
        }

        // outputs[0] = response after "enable"
        // outputs[1] = response after "cli numlines 0"
        // outputs[2] = response after "show running-config script" (the config)
        var rawConfig = outputs[2];

        if (!rawConfig || rawConfig.trim().length === 0) {
            console.error("Empty config output received");
            D.failure(D.errorType.GENERIC_ERROR);
            return;
        }

        var configContent = cleanOutput(rawConfig);

        if (!configContent || configContent.length === 0) {
            console.error("Config was empty after parsing");
            D.failure(D.errorType.GENERIC_ERROR);
            return;
        }

        var backupConfig = D.createBackup({
            label: "Running Configuration",
            running: configContent,
            ignoredLines: IGNORED_LINES
        });

        D.success(backupConfig);
    });
}

/**
 * @remote_procedure
 * @label Validate Hirschmann HiOS SSH Connection
 * @documentation Verifies SSH connectivity and credential validity by
 *                connecting and checking for a valid HiOS prompt.
 */
function validate() {
    var sshOptions = {
        username: D.device.username(),
        password: D.device.password(),
        prompt_regex: PROMPT_REGEX,
        commands: [
            "enable",
        ],
        inter_command_timeout_ms: 5000,
        global_timeout_ms: 20000
    };

    D.device.sendSSHCommands(sshOptions, function (outputs, error) {
        if (error) {
            console.error("Validation SSH error: " + JSON.stringify(error));

            if (error.message && error.message.toLowerCase().indexOf("auth") !== -1) {
                D.failure(D.errorType.AUTHENTICATION_ERROR);
            } else {
                D.failure(D.errorType.GENERIC_ERROR);
            }
            return;
        }

        console.info("Validation successful");
        D.success();
    });
}

/**
 * @remote_procedure
 * @label Back Up Hirschmann HiOS Configuration
 * @documentation Connects via SSH and retrieves the running configuration
 *                using "show running-config script". Stores the result
 *                as a configuration backup in Domotz.
 */
function backup_device() {
    backup();
}
