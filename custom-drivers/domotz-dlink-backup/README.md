# D-Link DIS-200G Configuration Backup

Domotz custom driver that backs up and restores the configuration of D-Link DIS-200G series industrial GigE switches over SSH.

## Compatible Devices

- D-Link DIS-200G-12S
- D-Link DIS-200G-12SW

## Requirements

- SSH enabled on the switch (`crypto key generate rsa` + `ip ssh server`)
- A user account at **privilege level 15** (admin)
- The device added to Domotz with SSH credentials configured

## How It Works

The script connects via SSH and runs the following command sequence:

1. `terminal datadump` — disables the `--More--` pager (equivalent of `terminal length 0` on Cisco IOS)
2. `show running-config` — retrieves the active running configuration
3. `show startup-config` — retrieves the saved startup configuration

Both configs are stored in a single Domotz backup entry with misalignment detection enabled — an alert will fire if the running and startup configs diverge.

The driver also supports **restore**: it enters global configuration mode, replays all stored config commands, and saves with `write memory`.

## Setup in Domotz

1. In Domotz, navigate to the target device → **Custom Drivers**.
2. Upload or paste `index.js`.
3. Set the device credentials to a privilege level 15 SSH user.
4. Run **Validate** to confirm connectivity, then enable the **Backup** schedule.
