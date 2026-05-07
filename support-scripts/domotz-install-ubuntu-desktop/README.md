# Domotz Agent Installer for Ubuntu Desktop

## Description

This is a shell script to set up and optimize a fresh Ubuntu Desktop 24.04 installation for running as a Domotz Pro agent. It performs system updates, installs necessary packages, configures the network to use `systemd-networkd` instead of `NetworkManager`, disables power saving features, and installs the Domotz Pro agent from the Snap store.

## Prerequisites

*   A fresh installation of Ubuntu Desktop 24.04.
*   Internet connection.
*   Sudo privileges.

## Usage

1.  Make the script executable:
    ```bash
    chmod +x ubuntu_desktop_24.04.sh
    ```
2.  Run the script:
    ```bash
    ./ubuntu_desktop_24.04.sh
    ```
3.  Type `yes` to confirm and proceed with the installation.
