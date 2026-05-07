# Dell OS10 Configuration Backup

Domotz custom integration script that backs up the running and startup configuration of Dell OS10 switches over SSH.

## Compatible Devices

- Dell EMC PowerSwitch series running SmartFabric OS10 (S-series, Z-series)

## Requirements

- SSH enabled on the switch
- A user account with the **sysadmin** or **admin** role
- The device added to Domotz with the SSH credentials configured

## How It Works

OS10 uses role-based access control (RBAC), so no `enable` command is needed — the SSH session starts with full privileges for admin-role accounts. The script runs the following command sequence:

1. `terminal length 0` — disables pagination
2. `terminal width 512` — prevents line wrapping in config output
3. `show running-configuration` — retrieves the active running configuration
4. `show startup-configuration` — retrieves the saved startup configuration

The output of each config command is captured directly by array index and cleaned of the echoed command line before being stored as a Domotz backup entry.

## Firmware Compatibility Note

The `show running-configuration` output header varies by OS10 firmware version — some versions begin with `Current Configuration:`, others with `! Version X.X.X.X`. If you find the running config is being stored empty or malformed, check the raw SSH output and adjust the `cleanOutput()` parsing in `index.js` if needed.

## Setup in Domotz

1. In Domotz, navigate to the target device → **Custom Drivers**.
2. Upload or paste `index.js`.
3. Set the device credentials to a sysadmin or admin-role SSH user.
4. Run **Validate** to confirm connectivity, then enable the **Backup** schedule.
