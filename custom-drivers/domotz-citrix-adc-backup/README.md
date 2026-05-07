# Citrix ADC Configuration Backup

Domotz custom driver that backs up the running configuration of a Citrix ADC (NetScaler) appliance over SSH.

## Compatible Devices

- Citrix ADC (NetScaler) appliances

## Requirements

- SSH enabled on the appliance
- A user account with permission to run `show ns runningConfig`
- The device added to Domotz with SSH credentials configured

## How It Works

The script connects via SSH and executes `show ns runningConfig`, capturing the plain-text output directly. No TFTP is used, which keeps the backup in a text format that Domotz can store and diff between runs.

## Setup in Domotz

1. In Domotz, navigate to the target device → **Custom Drivers**.
2. Upload or paste `index.js`.
3. Set the device credentials to an SSH user with permission to run `show ns runningConfig`.
4. Run **Validate** to confirm connectivity, then enable the **Backup** schedule.
