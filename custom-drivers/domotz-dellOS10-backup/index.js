/**
 * Custom Integration for Dell OS10 Switch
 * Description: This Configuration Management Script extracts the Dell OS10
 * running and startup configuration and backs it up.
 *
 * Communication protocol is SSH
 *
 * Tested against: Dell EMC OS10 (SmartFabric OS10 / PowerSwitch S-series, Z-series)
 *
 * Note: OS10 uses RBAC — no `enable` command is required. The SSH user must
 * have the sysadmin or admin role assigned to read configuration.
 *
 * Note: OS10 running-config output begins with "Current Configuration:" on some
 * firmware versions and "! Version" on others. Verify markers against your
 * firmware version and adjust extractSection() calls in parseConfigs() if needed.
 *
 * Required permissions: sysadmin or admin role
 */

var sshOptions = {
    username: D.device.username(),
    password: D.device.password(),
    inter_command_timeout_ms: 500,
    global_timeout_ms: 60000,
    prompt: "#",
    commands: [
        "terminal length 0",          // Disable pagination
        "terminal width 512",         // Prevent line wrapping in config output
        "show running-configuration", // Retrieve running configuration
        "show startup-configuration"  // Retrieve startup configuration
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
 * Cleans a raw config string from SSH output: strips echoed command line,
 * trims surrounding whitespace, and collapses consecutive blank lines.
 */
function cleanOutput(raw) {
    if (!raw) return "";
    // Drop the first line (echoed command) and trim
    var lines = raw.split(/\r?\n/);
    if (lines.length > 1) {
        lines = lines.slice(1);
    }
    return lines
        .join("\n")
        .replace(/^\s*[\r\n]+|[\r\n]+\s*$/g, "")
        .replace(/(\r?\n){2,}/g, "\n");
}

/**
 * Parses the SSH output array into running and startup config strings.
 * Output array index: [0] terminal length, [1] terminal width,
 *                     [2] show running-configuration, [3] show startup-configuration
 */
function parseConfigs(output) {
    if (!Array.isArray(output) || output.length < 3) {
        console.error("Unexpected output format. Expected an array of at least 3 elements.");
        D.failure(D.errorType.GENERIC_ERROR);
        return null;
    }

    var runningConfig = cleanOutput(output[2]);
    var startupConfig = output[3] ? cleanOutput(output[3]) : "";

    if (!runningConfig) {
        console.error("Running config output was empty — verify device credentials and role.");
        D.failure(D.errorType.PARSING_ERROR);
        return null;
    }

    return { running: runningConfig, startup: startupConfig };
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
            label: "Dell OS10 Configuration Backup",
            running: configs.running,
            startup: configs.startup
        })
    );
}

/**
 * Validate function: Ensures authentication is successful and the device
 * responds to basic commands.
 */
function validate() {
    D.device.sendSSHCommands(sshOptions, validateCallback);
}

/**
 * @remote_procedure
 * @label Backup Dell OS10 Configuration
 * @documentation Retrieves and stores the running and startup configuration
 * backup for Dell OS10 switches.
 */
function backup() {
    D.device.sendSSHCommands(sshOptions, backupCallback);
}
