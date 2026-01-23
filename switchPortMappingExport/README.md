# Switch Port Mapping Export Processor

## Description

This Python script processes a device export file from Domotz (in CSV or Excel format). It identifies devices that are connected to a switch and creates a clear, human-readable report mapping each device to the specific switch and port it's connected to.

## Prerequisites

*   Python 3.
*   `pandas` library installed (`pip install pandas`).
*   A device export file from Domotz.

## Usage

Run the script from the command line, providing the path to the Domotz export file as an argument:
```bash
python3 main.py <path_to_domotz_export_file.csv>
```