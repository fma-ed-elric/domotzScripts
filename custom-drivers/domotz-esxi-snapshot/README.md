# ESXi Snapshot Monitor

## Description

This script is a Domotz Custom Driver that monitors VMware ESXi snapshots. It detects virtual machines with snapshots, calculates their age in days, and displays the information in a table. It will show a warning emoji if a VM is running on a snapshot.

## Prerequisites

*   Domotz Pro agent.
*   ESXi host credentials (username and password) configured in Domotz.
*   The script uses the ESXi SOAP API.

## Usage

1.  Upload the script to your Domotz agent.
2.  The script will automatically run and populate the "VM Snapshot Status" table.
