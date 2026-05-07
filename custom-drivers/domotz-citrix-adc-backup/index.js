/**
 * Name: Citrix ADC Running Config Backup
 * Description: Captures the running configuration of a Citrix ADC (NetScaler) as plain text.
 * * Communication protocol is SSH.
 * * This script executes the 'show ns runningConfig' command and captures the output directly.
 * * It does NOT use TFTP, ensuring the backup is in a text format that Domotz can manage and compare.
 * * Pre-requisites:
 * - SSH credentials must have permissions to run 'show ns runningConfig'.
 */

// --- Configuration ---
const COMMAND = 'show ns runningConfig';
const SSH_TIMEOUT = 60000; 

// --- SSH Execution and Error Handling ---

/**
 * Handles SSH errors by logging them and failing the driver execution.
 * @param {object} error - The error object from the SSH command.
 */
function handleSshError(error) {
    console.error("SSH command failed:", error.message || JSON.stringify(error));
    if (error && error.code === 5) {
        D.failure(D.errorType.AUTHENTICATION_ERROR);
    } else if (error && (error.code === 255 || error.code === 1)) {
        D.failure(D.errorType.RESOURCE_UNAVAILABLE);
    } else {
        D.failure(D.errorType.GENERIC_ERROR);
    }
}

/**
 * Executes a single SSH command and returns a promise.
 * @param {string} commandToExecute - The command to run on the device.
 * @returns {Promise} A promise that resolves with the command output or rejects with an error.
 */
function executeSshCommand(commandToExecute) {
    var d = D.q.defer();
    var sshConfig = {
        username: D.device.username(),
        password: D.device.password(),
        timeout: SSH_TIMEOUT,
        command: commandToExecute
    };

    D.device.sendSSHCommand(sshConfig, function (output, error) {
        if (error) {
            d.reject(error);
        } else {
            // Check for common error strings in the output
            if (output && (output.toLowerCase().includes('command not found') || output.toLowerCase().includes('login incorrect'))) {
                d.reject({ message: "Error in command output: " + output });
            } else {
                d.resolve(output);
            }
        }
    });
    return d.promise;
}

// --- Remote Procedures ---

/**
 * @remote_procedure
 * @label Validate SSH Connectivity
 * @documentation Validates that the driver can connect to the Citrix ADC and run a simple command.
 */
function validate() {
    console.info("Validating SSH connectivity to Citrix ADC...");
    executeSshCommand('show version')
        .then(function() {
            console.info("Validation successful.");
            D.success();
        })
        .catch(function(err) {
            handleSshError(err);
        });
}

/**
 * @remote_procedure
 * @label Backup Running Configuration
 * @documentation Executes 'show ns runningConfig' and saves the output as a text-based backup.
 */
function backup() {
    console.info("Executing '" + COMMAND + "' to capture running configuration...");
    executeSshCommand(COMMAND)
        .then(function (configOutput) {
            if (!configOutput || configOutput.length < 50) { // Basic sanity check on the output length
                console.error("Configuration output seems too short or empty.");
                return D.failure(D.errorType.PARSING_ERROR, "No valid configuration was returned.");
            }
            
            console.info("Successfully captured configuration text (" + configOutput.length + " characters).");
            
            var configBackup = D.createBackup({
                label: "Running Config (Text)",
                running: configOutput // Pass the plain text string directly
            });
            D.success(configBackup);
        })
        .catch(function(err) {
            handleSshError(err);
        });
}
