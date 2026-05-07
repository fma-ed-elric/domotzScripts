/**
 * Name: Cisco Nexus Configuration Backup (SSH)
 * Description: Pulls running-config from Cisco Nexus (NX-OS) using SSH only.
 * Requirements:
 * - The SSH user must have sufficient privilege to run:
 *     terminal length 0
 *     show running-config
 * - Typical roles: network-admin or equivalent read privilege.
 *
 * Notes:
 * - No SCP/TFTP used. Output is captured via SSH and returned to Domotz.
 * - Pagination is disabled via "terminal length 0".
 */

var sshOptions = {
    username: D.device.username(),
    password: D.device.password(),
    port: 22,
    inter_command_timeout_ms: 2000,
    global_timeout_ms: 60000,
    prompt: "#",
    exec_prompt: "#",
    pty: false,
    // Broad algorithm set to accommodate various NX-OS images
    algorithms: {
        kex: [
            "curve25519-sha256",
            "curve25519-sha256@libssh.org",
            "ecdh-sha2-nistp256",
            "ecdh-sha2-nistp384",
            "ecdh-sha2-nistp521",
            "diffie-hellman-group-exchange-sha256",
            "diffie-hellman-group14-sha256",
            "diffie-hellman-group14-sha1" // legacy fallback if needed
        ],
        serverHostKey: [
            "rsa-sha2-256",
            "ssh-rsa",
            "ecdsa-sha2-nistp256",
            "ecdsa-sha2-nistp384",
            "ecdsa-sha2-nistp521"
        ],
        cipher: [
            "aes128-gcm@openssh.com",
            "aes256-gcm@openssh.com",
            "aes128-ctr",
            "aes192-ctr",
            "aes256-ctr"
        ]
    },
    commands: [] // set in validate()/backup()
};

/**
 * Maps SSH errors to Domotz error types and reports them.
 * @param {object} err
 */
function checkSshError(err) {
    if (!err) {
        D.failure(D.errorType.GENERIC_ERROR);
    } else if (err.code === 5) {
        D.failure(D.errorType.AUTHENTICATION_ERROR);
    } else if (err.code === 255 || err.code === 1) {
        D.failure(D.errorType.RESOURCE_UNAVAILABLE);
    } else if (err.message && err.message.toLowerCase().indexOf("timeout") !== -1) {
        D.failure(D.errorType.TIMEOUT);
    } else {
        D.failure(D.errorType.GENERIC_ERROR);
    }
}

/**
 * Removes ANSI codes, --More-- prompts, repeated CR/LF,
 * and trims leading/trailing whitespace.
 * @param {string} raw
 * @returns {string}
 */
function cleanOutput(raw) {
    if (!raw) return "";
    return raw
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")       // ANSI escapes
        .replace(/--More--[\s\S]*?(?=\n)/g, "")      // pagers
        .replace(/\r/g, "")                          // normalize CRLF -> LF
        .replace(/\n{2,}/g, "\n")                    // collapse blank lines
        .trim();
}

/**
 * From an array of SSH outputs, pick the block most likely to be the
 * running-config and strip echoed command/prompt noise.
 * @param {Array} outputs
 * @returns {string|null}
 */
function parseRunningConfig(outputs) {
    if (!outputs || !outputs.length) return null;

    // Choose the longest block after cleaning (usually the config)
    var i, best = "";
    for (i = 0; i < outputs.length; i++) {
        var block = cleanOutput(outputs[i]);
        if (block.length > best.length) {
            best = block;
        }
    }

    if (!best) return null;

    // If the command echo "show running-config" exists, strip everything up to it
    var idx = best.toLowerCase().indexOf("show running-config");
    if (idx !== -1) {
        best = best.substring(idx + "show running-config".length);
    }

    // Remove any leading prompt line(s) that may have stuck around
    // e.g., "switch#"
    best = best.replace(/^[^\n]*#\s*\n/, "");

    // NX-OS configs typically start with "version " or "!" line; both are acceptable.
    // If there is still a trailing prompt, drop the last prompt-looking line.
    var lines = best.split("\n");
    if (lines.length > 0 && /#\s*$/.test(lines[lines.length - 1])) {
        lines.pop();
        best = lines.join("\n");
    }

    // Final tidy
    best = best.trim();
    return best.length ? best : null;
}

/**
 * @remote_procedure
 * @label Validate SSH Support (Nexus)
 * @documentation Confirms SSH access to the Nexus device.
 */
function validate() {
    console.info("Testing SSH login for Cisco Nexus...");

    // Use safe, widely supported commands on NX-OS
    sshOptions.commands = ["terminal length 0", "show clock"];

    D.device.sendSSHCommands(sshOptions, function(out, err) {
        if (err) {
            console.error("SSH validation failed.");
            checkSshError(err);
        } else {
            console.info("SSH validated successfully.");
            D.success();
        }
    });
}

/**
 * @remote_procedure
 * @label Backup Cisco Nexus Config via SSH
 * @documentation Retrieves Cisco Nexus running-config directly over SSH.
 */
function backup() {
    console.info("Initiating SSH-based configuration backup (Cisco Nexus)...");

    sshOptions.commands = ["terminal length 0", "show running-config"];

    D.device.sendSSHCommands(sshOptions, function(out, err) {
        if (err) {
            console.error("Failed to retrieve configuration via SSH.");
            checkSshError(err);
            return;
        }

        var config = parseRunningConfig(out);
        if (!config) {
            console.error("No valid configuration found in output.");
            D.failure(D.errorType.RESOURCE_UNAVAILABLE);
            return;
        }

        console.info("Configuration retrieved successfully.");
        D.success(D.createBackup({
            label: "Cisco Nexus Running Config (SSH)",
            running: config
        }));
    });
}

