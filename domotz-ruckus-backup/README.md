# Domotz Ruckus Switch Configuration Backup

This script is a Domotz custom driver that performs a backup of the `running-config` from a Ruckus switch.

## Description

The driver works by initiating a TFTP server on the Domotz agent. It then connects to the target Ruckus switch via SSH and issues a command to copy the `running-config` to the agent's TFTP server. The received configuration is then saved as a backup within the Domotz platform.

## Prerequisites

- A Ruckus switch device monitored by Domotz.
- SSH credentials (username and password) must be configured for the device in Domotz.
- The provided SSH user must have **Privilege Level 15** in order to enter the privileged EXEC mode (`#`) directly upon login. This is required for the script to execute the necessary commands.

## Usage Example

1.  **Upload to Domotz:** Upload this script as a custom driver in your Domotz account.
2.  **Associate with Device:** Associate the "Backup Ruckus Configuration" driver with your Ruckus switch device.
3.  **Run the Driver:** Execute the driver from the device's "Scripts" tab in the Domotz interface. A new entry will be created in the "Backups" section upon successful completion.
