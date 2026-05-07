# Dell OS6 Configuration Backup

Domotz custom integration script that backs up the running and startup configuration of Dell OS6 switches over SSH.

## Compatible Devices

- Dell N-series and S-series switches running OS6 (FTOS-based)

## Requirements

- SSH enabled on the switch
- A local user account at **privilege level 15**
- The device added to Domotz with the SSH credentials configured

## How It Works

The script connects via SSH and runs the following command sequence:

1. `enable` — enters privileged EXEC mode (can take 15+ seconds on some OS6 devices)
2. `terminal width 256` — prevents line wrapping in config output
3. `terminal length 0` — disables pagination
4. `show running-config` — retrieves the active running configuration
5. `show startup-config` — retrieves the saved startup configuration

The output is parsed by searching for the section header strings `Current Configuration:` (running) and `Startup Configuration:` (startup). Both configs are stored as a single Domotz backup entry.

## Known Issues

- The `enable` command can take **15+ seconds** on some OS6 devices before the privileged prompt appears. The `global_timeout_ms` is set to `120000` (2 minutes) to avoid a race with the Domotz UI timeout.

## Setup in Domotz

1. In Domotz, navigate to the target device → **Custom Drivers**.
2. Upload or paste `index.js`.
3. Set the device credentials to a level-15 SSH user.
4. Run **Validate** to confirm connectivity, then enable the **Backup** schedule.
