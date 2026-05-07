/**
 * @remote_procedure
 * @label Backup Ruckus Configuration
 * @documentation This driver backs up the running-config of a Ruckus switch. 
 * Requirements: The SSH user must have Privilege Level 15 to land directly in '#' mode.
 */

const TFTP_FILENAME = Date.now() + '_ruckus_config.cfg';

// SSH options: Expecting the '#' prompt immediately
const sshOptions = {
    username: D.device.username(),
    password: D.device.password(),
    prompt: '#', 
    timeout: 30000,
    inter_command_timeout_ms: 2000
};

function handleSshError(error) {
    console.error("SSH error:", error ? error.message : 'Unknown error');
    if (error && error.code === 5) {
        D.failure(D.errorType.AUTHENTICATION_ERROR);
    } else {
        D.failure(D.errorType.GENERIC_ERROR);
    }
}

function startBackup() {
    const serverOptions = {
        port: 69,
        filePath: TFTP_FILENAME,
        timeout: 30000 
    };

    function onReady(error, host, port) {
        if (error) {
            console.error("TFTP server failed:", error);
            D.failure(D.errorType.GENERIC_ERROR);
            return;
        }
        
        console.info('TFTP server ready on %s. Sending copy command...', host);

        // Command for Ruckus/ICX to push config to the Domotz Agent
        const tftpCommands = [
            'copy running-config tftp ' + host + ' ' + TFTP_FILENAME
        ];

        sshOptions.commands = tftpCommands;
        D.device.sendSSHCommands(sshOptions, function(output, error) {
            if (error) {
                handleSshError(error);
            } else {
                console.info("SSH Command sequence sent. Waiting for file transfer...");
            }
        });
    }

    function onUpload(error, content) {
        if (error) {
            console.error("File transfer error:", error);
            D.failure(D.errorType.GENERIC_ERROR);
            return;
        }

        if (content && content.length > 0) {
            console.info('Backup received: %d bytes', content.length);
            const backup = D.createBackup({
                label: "Ruckus Running Config",
                running: content
            });
            D.success(backup);
        } else {
            console.error("Backup failed: Received empty content.");
            D.failure(D.errorType.GENERIC_ERROR);
        }
    }

    D.tftpServer.accept(serverOptions, onReady, onUpload);
}

function validate() {
    sshOptions.commands = ['show stack']; // Fast command to verify connectivity
    D.device.sendSSHCommands(sshOptions, function(output, error) {
        if (error) {
            handleSshError(error);
        } else {
            D.success();
        }
    });
}

function backup() {
    startBackup();
}
