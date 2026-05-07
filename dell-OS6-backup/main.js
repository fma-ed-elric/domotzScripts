/**
 * Custom Integration for Dell OS6 Switch
 * Description: This Configuration Management Script extracts the Dell OS6
 * running and startup configuration and backs it up.
 *
 * Communication protocol is SSH
 *
 * Tested against: Dell OS6 (N-series / S-series, FTOS-based)
 *
 * Known issue: The `enable` command can take 15+ seconds on some OS6 devices.
 * global_timeout_ms is set to 120000 to accommodate this without racing the
 * UI timeout. See bug ticket: Dell OS6 config backup — SSH sequence completes
 * but backup times out in UI.
 *
 * Required permissions: Level 15 user
 */

var sshOptions = {
    username: D.device.username(),
    password: D.device.password(),
    inter_command_timeout_ms: 500,
    global_timeout_ms: 120000, // Extended: enable can take 15s+ on OS6
    prompt: "#",
    commands: [
        "enable",               // Enter privileged mode
        "terminal width 256",   // Prevent line wrapping in config output
        "terminal length 0",    // Disable pagination
        "show running-config",  // Retrieve running configuration
        "show startup-config"   // Retrieve startup configuration
    ]
};

/**
 * Handles SSH errors with appropriate Domotz error types.
 */
function handleSshError(error) {
    console.error("SSH error:", error.message);
    if (error.code === 5) {
        D.failure(D.errorType.AUTHENTICATION_ERROR);
    } else if (error.code === 255 || error.code === 1) {
        D.failure(D.errorType.RESOURCE_UNAVAILABLE);
    } else {
        D.failure(D.errorType.GENERIC_ERROR);
    }
}

/**
 * Extracts a config section from combined output, anchored on a known header string.
 * Falls back to full output if the anchor is not found.
 */
function extractSection(combined, startMarker) {
    var startIndex = combined.indexOf(startMarker);
    if (startIndex === -1) {
        console.error("Could not find section marker: " + startMarker);
        return null;
    }
    var section = combined.substring(startIndex);
    // Strip trailing prompt line
    var promptMatch = section.match(/[\r\n](\S+#)\s*$/);
    if (promptMatch) {
        section = section.substring(0, promptMatch.index);
    }
    return section
        .replace(/^\s*[\r\n]+|[\r\n]+\s*$/g, "")
        .replace(/(\r?\n){2,}/g, "\n");
}

/**
 * Parses the combined SSH output array into running and startup config strings.
 * Output array index: [0] enable, [1] terminal width, [2] terminal length,
 *                     [3] show running-config, [4] show startup-config
 */
function parseConfigs(output) {
    if (!Array.isArray(output)) {
        console.error("Unexpected output format. Expected an array.");
        D.failure(D.errorType.GENERIC_ERROR);
        return null;
    }

    var combined = output.join("\n");

    // Dell OS6 running-config begins with "Current Configuration:"
    // startup-config begins with "Startup Configuration:" or similar
    var runningConfig = extractSection(combined, "Current Configuration:");
    var startupConfig = extractSection(combined, "Startup Configuration:");

    // Fallback: if markers not found, use raw output blocks directly
    if (!runningConfig) {
        console.error("Running config marker not found, check OS6 output format.");
        D.failure(D.errorType.PARSING_ERROR);
        return null;
    }

    return { running: runningConfig, startup: startupConfig || "" };
}

/**
 * Callback for validate().
 */
function validateCallback(output, error) {
    if (error) {
        handleSshError(error);
        return;
    }
    console.info("Validation successful.");
    D.success();
}

/**
 * Callback for backup().
 */
function backupCallback(output, error) {
    if (error) {
        handleSshError(error);
        return;
    }

    var configs = parseConfigs(output);
    if (!configs) return;

    D.success(
        D.createBackup({
            label: "Dell OS6 Configuration Backup",
            running: configs.running,
            startup: configs.startup
        })
    );
}

/**
 * Validate function: Ensures authentication is successful and the device
 * responds to basic privileged commands.
 */
function validate() {
    D.device.sendSSHCommands(sshOptions, validateCallback);
}

/**
 * @remote_procedure
 * @label Backup Dell OS6 Configuration
 * @documentation Retrieves and stores the running and startup configuration
 * backup for Dell OS6 switches.
 */
function backup() {
    D.device.sendSSHCommands(sshOptions, backupCallback);
}
