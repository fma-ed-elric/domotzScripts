# Hirschmann HiOS Configuration Backup

Domotz custom driver that backs up the running configuration of Hirschmann HiOS switches over SSH.

## Compatible Devices

- Hirschmann Greyhound GRS series (tested on GRS1042, HiOS-3A-09.0.02)
- Hirschmann Bobcat BRS series (tested on BRS20, HiOS-2S-09.0.02)

## Requirements

- SSH enabled on the switch
- No `enable` password set (the script enters privileged EXEC with a blank enable password)
- The device added to Domotz with SSH credentials configured

## How It Works

The script connects via SSH and runs the following command sequence:

1. `enable` — escalates to privileged EXEC mode (no password required)
2. `cli numlines 0` — disables the pager so the full config is returned in one shot
3. `show running-config script` — retrieves the running configuration in script format

The output is cleaned of echoed commands and trailing prompts before being stored as a Domotz backup entry. Lines containing uptime counters are excluded from drift detection to avoid false alerts.

## Setup in Domotz

1. In Domotz, navigate to the target device → **Custom Drivers**.
2. Upload or paste `index.js`.
3. Set the device credentials to an SSH user (ensure no `enable` password is configured on the switch).
4. Run **Validate** to confirm connectivity, then enable the **Backup** schedule.
