# Domotz Import External Hosts

Bulk-imports external hosts into a Domotz agent via the [Domotz Public API](https://portal.domotz.com/api-docs).

## Prerequisites

- PowerShell 5.1+ (Windows) or PowerShell 7+ (cross-platform)
- A valid Domotz API key
- The numeric Agent ID of the target Domotz agent

## CSV Format

The CSV must have exactly these two columns:

| Column | Description |
|--------|-------------|
| `name` | Display name for the external host |
| `host` | Hostname or IP address |

**Example `hosts.csv`:**
```csv
name,host
Google DNS,8.8.8.8
Cloudflare DNS,1.1.1.1
My Web Server,myserver.example.com
```

## Usage

```powershell
.\Import-ExternalHosts.ps1
```

You will be prompted for the following:

| Prompt | Description | Example |
|--------|-------------|---------|
| Domotz API base URL | Regional base URL including `/public-api/v1` (no trailing slash) | `https://api-us-east-1-cell-1.domotz.com/public-api/v1` |
| Agent ID | Numeric ID of the target Domotz agent | `42` |
| API Key | Your Domotz API key — input is hidden | |
| CSV file path | Absolute or relative path to your CSV | `.\hosts.csv` |

## Output

Progress is printed to the console for every row:

```
  [OK]   Google DNS (8.8.8.8)
  [FAIL] Bad Host (notahost) — 400 Bad Request
```

A summary is shown at the end:

```
-------------------------------------------
Import complete.
  Succeeded : 2
  Failed    : 1
  Error log : import_errors_agent42_20260505_143012.log
-------------------------------------------
```

### Error Log

If any rows fail, a timestamped log file is written to the script directory:

```
import_errors_agent<ID>_<YYYYMMDD_HHmmss>.log
```

Each line in the log contains the timestamp, agent ID, host name, host address, and the error message returned by the API — making it easy to identify and retry failed entries.

## Multiple Agents

Run the script once per agent, supplying a different Agent ID each time. Each run produces its own scoped error log (`import_errors_agent<ID>_<timestamp>.log`) so reports stay separated by agent.

## Security Notes

- The API key is read as a `SecureString` and is never written to disk or printed to the console.
- The plain-text value is held in memory only for the duration of the script and the BSTR buffer is zeroed immediately after conversion.
