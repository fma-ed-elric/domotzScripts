# Domotz Custom Driver Mass Application Guide

This guide will help you efficiently apply one or more custom drivers to multiple devices in your Domotz account using PowerShell scripts. Follow the workflow below to ensure a smooth process.

---

## Prerequisites

1. **Ensure the following files are in the same directory:**

   | File | Purpose |
   |------|---------|
   | `Prepare-DevicesCSV.ps1` | Automated script to filter devices and generate `Devices.csv` |
   | `Devices.csv` | CSV file where device associations are defined |
   | `Device-List-Script.ps1` | Optional: export a full device inventory CSV |
   | `listCustomDrivers.ps1` | Optional: export a list of custom drivers and their IDs |
   | `MassApplyScripts.ps1` | Applies custom drivers in bulk |

2. **Ensure PowerShell Execution Policy allows script execution.**
   If needed, run the following in PowerShell (as Administrator):
   ```powershell
   Set-ExecutionPolicy Unrestricted -Scope Process
   ```

3. **All scripts prompt for your Domotz API key at runtime** — it does not need to be stored anywhere in the files.

---

## Recommended Workflow (Automated)

### Step 1: Run `Prepare-DevicesCSV.ps1`

This is the primary script for the mass apply workflow. It will:

- Prompt for your Domotz API key
- Ask for filter criteria to narrow down devices. Leave any filter empty to skip it:
  - Site name, device type, make, model, firmware version
  - Agent status, device status, SNMP status, authentication status
- Retrieve all matching devices from your Domotz account
- Display all available custom drivers and prompt you to select one by ID
- Prompt for sample period (`5m`, `10m`, `15m`, `30m`, `1hr`, `2hr`, `6hr`, `12hr`, `24hr` — default `30m`)
- Ask whether the driver requires credentials:
  1. **No** — credentials left blank (e.g. SNMP drivers that use strings already stored in Domotz)
  2. **Yes, same for all devices** — enter username/password once, applied to every row
  3. **Yes, different per device** — enter username/password individually for each device
- Write `Devices.csv` with all required columns populated
- Offer to immediately run `MassApplyScripts.ps1`

### Step 2: Review `Devices.csv` (Optional but Recommended)

Before running the mass apply, open `Devices.csv` and verify the device IDs, agent IDs, driver ID, credentials, and sample periods look correct.

### Step 3: Run `MassApplyScripts.ps1` (if not launched automatically)

- Prompts for your Domotz API key
- Reads `Devices.csv` and applies the specified custom driver to each device
- Logs all successful associations, failures, already-associated devices, and retries
- If a sample period conflict is detected, the script automatically retries with the driver's minimum required sample period

### Step 4: Review the Log

A log file (`Driver_Association_Log.txt`) is created in the same directory containing:

- All successful driver associations
- Failures and their reasons (e.g. invalid driver, API issues)
- Any automatic retries performed

---

## Standalone Scripts

### `Device-List-Script.ps1`
Run independently to export a full device inventory to `Domotz_Device_Report.csv`. Useful for auditing your environment or identifying devices outside of the mass apply workflow.

### `listCustomDrivers.ps1`
Run independently to export all custom drivers and their IDs to `CustomDrivers.csv`. Useful for looking up driver IDs without going through `Prepare-DevicesCSV.ps1`.

---

## `Devices.csv` Column Reference

| Column | Description |
|--------|-------------|
| `device_id` | Domotz Device ID |
| `agent_id` | Domotz Agent/Site ID |
| `driver_id` | Custom Driver ID to apply |
| `username` | Credential username (leave blank if not required) |
| `password` | Credential password (leave blank if not required) |
| `sample_period` | How often the driver polls the device. Valid values: `5m`, `10m`, `15m`, `30m` (default), `1hr`, `2hr`, `6hr`, `12hr`, `24hr` |

> To apply multiple drivers to the same device, add a separate row for each driver using the same `device_id` and `agent_id` but a different `driver_id`.

---

## Troubleshooting

**Script not running?**
Ensure PowerShell execution policy allows scripts:
```powershell
Set-ExecutionPolicy Unrestricted -Scope Process
```

**No devices returned?**
Check your filter inputs. Leave all filters empty to return all devices and narrow down from there.

**Driver not listed in `Prepare-DevicesCSV.ps1`?**
Run `listCustomDrivers.ps1` separately to verify the driver exists in your account.

**Failure in driver association?**
Check `Driver_Association_Log.txt` for details.

**Persistent errors?**
Reach out to Spencer Hunsicker (spencer.hunsicker@domotz.com)
