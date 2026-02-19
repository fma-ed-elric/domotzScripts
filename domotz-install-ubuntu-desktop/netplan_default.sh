#!/bin/bash

NETPLAN_FILE="/etc/netplan/00-installer-config.yaml"

echo "Writing netplan config to $NETPLAN_FILE..."

sudo tee "$NETPLAN_FILE" > /dev/null <<EOL
network:
  version: 2
  renderer: networkd
  ethernets:
    all-en:
      match:
        name: "en*"
      dhcp4: true
    all-eth:
      match:
        name: "eth*"
      dhcp4: true
EOL

sudo chmod 600 "$NETPLAN_FILE"
sudo netplan apply

echo "Done. Netplan config applied."
