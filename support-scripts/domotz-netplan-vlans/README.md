# Netplan VLAN Configuration

## Description

This script provides an interactive way to configure Virtual LANs (VLANs) on a Linux system using netplan. It prompts the user to select a network interface, specify the number of VLANs, and enter VLAN IDs and IP addresses. The script validates all inputs, creates a backup of the existing netplan configuration, and writes the new VLAN definitions to the netplan file.

## Prerequisites

*   A Linux system using netplan for network configuration.
*   Root privileges (the script must be run as root).
*   An existing netplan configuration file (default: `/etc/netplan/00-installer-config.yaml`).

## Usage

1.  Update the `NETPLAN_FILE` variable at the top of the script to match your netplan file path.
2.  Run the script as root: `sudo bash add_vlans.sh`.
3.  Follow the interactive prompts to select an interface, enter VLAN IDs, and assign IP addresses.
4.  Review the configuration preview and confirm to apply. The script will back up the original netplan file before writing changes.
5.  After the script completes, apply the new configuration with `netplan apply`.
