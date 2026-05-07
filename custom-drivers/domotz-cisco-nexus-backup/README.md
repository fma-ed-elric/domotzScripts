# Cisco Nexus Configuration Backup

Domotz custom driver that backs up the running configuration of Cisco Nexus (NX-OS) switches over SSH.

## Compatible Devices

- Cisco Nexus series switches running NX-OS

## Requirements

- SSH enabled on the switch
- A user account with sufficient privilege to run `terminal length 0` and `show running-config` (typically `network-admin` or equivalent)
- The device added to Domotz with SSH credentials configured

## How It Works

The script connects via SSH and runs the following command sequence:

1. `terminal length 0` — disables pagination so the full config is returned in one shot
2. `show running-config` — retrieves the active running configuration

No SCP or TFTP is used. Output is captured directly over SSH and stored as a Domotz backup entry. A broad set of KEX, host-key, and cipher algorithms is specified to accommodate various NX-OS firmware versions.

## Setup in Domotz

1. In Domotz, navigate to the target device → **Custom Drivers**.
2. Upload or paste `index.js`.
3. Set the device credentials to an SSH user with network-admin or equivalent privilege.
4. Run **Validate** to confirm connectivity, then enable the **Backup** schedule.
