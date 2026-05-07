# Hyper-V VM & Replication Monitor

## Description

This Domotz Custom Driver monitors Microsoft Hyper-V virtual machines. It collects information about VM state, OS, memory usage, CPU usage, uptime, and replication health. It will generate a warning in the Domotz logs if replication health is not "Normal".

## Prerequisites

*   Domotz Pro agent.
*   WinRM enabled and configured on the Hyper-V host.
*   Hyper-V host credentials (username and password) configured in Domotz.

## Usage

1.  Upload the script to your Domotz agent.
2.  The script will create a "Virtual Machines" table with the collected data.
