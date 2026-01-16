
# Domotz Device-Switch Mapper

This Python script processes a device list exported from the Domotz portal (Excel or CSV) and generates a human-readable mapping of which devices are connected to which managed switches and specific ports.



## Features
* **Automatic ID Resolution:** Matches the "Connected To switch" ID with the actual device name in your inventory.
* **Data Cleaning:** Automatically handles missing port data and formats decimal port numbers (e.g., `2.0`) into clean integers (`2`).
* **Flexible Input:** Accepts both `.csv` and `.xlsx` files as command-line arguments.

---

## Prerequisites
Before running the script, ensure you have Python 3 installed and the required libraries:

```bash
pip install pandas openpyxl

```

---

## How to Export the Data from Domotz

1. Log in to your **Domotz Portal**.
2. Select the **Agent/Site** you want to map.
3. Go to the **Device List** tab.
4. Click the **Export** button (usually a document icon) and select **Excel** or **CSV**.
5. Save the file to your script directory.

---

## Usage

Run the script from your terminal by passing the path to your exported file as an argument:

```bash
python3 switchlinks.py <path_to_your_export_file>

```

### Example:

```bash
python3 switchlinks.py device_list_export_2026-01-16.csv

```

---

## Example Output

The script will output a table formatted like this:

| DEVICE | CONNECTED TO SWITCH | PORT |
| --- | --- | --- |
| Workstation-Alpha | Core-Switch-01 | 12 |
| Printer-Main | Office-Switch-B | 4 |
| AP-Ceiling-West | Core-Switch-01 | 24 |

---

## Troubleshooting

* **File Not Found:** Ensure you are in the correct directory or provide the full path to the file.
* **Missing Columns:** This script expects the standard Domotz export headers: `Id`, `Name`, `Connected To switch`, and `Switch Port`.
* **Format Errors:** If using a CSV, ensure it is UTF-8 encoded. If using Excel, ensure the file is not currently open in another program.

```

```
