#!/bin/bash
# Confirmation message
echo "------------------------------------------------------------"
echo "This script will perform the following actions:"
echo "1. Update System and install key packages"
echo "2. Load the 'tun' module"
echo "3. Install Domotz Pro agent via Snap"
echo "4. Grant Snap permissions"
echo "5. Configure UFW (Port 3000)"
echo "6. MIGRATE: NetworkManager -> systemd-networkd"
echo "7. CONFIGURE: Netplan with networkd renderer"
echo "8. LOCKDOWN: Disable all Power Saving/Sleep modes"
echo "9. Resolve DNS/VPN symlink issues"
echo "10. Disable cloud-init network config"
echo "------------------------------------------------------------"

read -p "Type 'yes' to proceed: " confirmation1
[[ "$confirmation1" != "yes" ]] && exit 1

# Set non-interactive mode
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

step_message() {
    echo "------------------------------------------------------------"
    echo "Step $1: $2"
    echo "------------------------------------------------------------"
}

progress_message() {
    echo "   [+] $1"
}

# Step 1: Updates
step_message 1 "Updating System and installing key packages"
sudo apt update && sudo apt upgrade -y
sudo apt install -y net-tools openvswitch-switch ethtool

# Step 2: Tun Module
step_message 2 "Loading tun module"
sudo modprobe tun
sudo grep -qxF "tun" /etc/modules || sudo sh -c 'echo "tun" >> /etc/modules'

# Step 3 & 4: Domotz Installation & Permissions
step_message 3 "Installing Domotz Pro agent"
sudo snap install domotzpro-agent-publicstore
permissions=("firewall-control" "network-observe" "raw-usb" "shutdown" "system-observe")
for permission in "${permissions[@]}"; do
    sudo snap connect "domotzpro-agent-publicstore:$permission"
done

# Step 5: Firewall
step_message 5 "Allowing port 3000 in UFW"
sudo ufw allow 3000

# Step 6: Migrate to systemd-networkd
step_message 6 "Switching Renderer from NetworkManager to networkd"
progress_message "Enabling systemd-networkd..."
sudo systemctl enable systemd-networkd
sudo systemctl start systemd-networkd
progress_message "Stopping NetworkManager..."
sudo systemctl stop NetworkManager
sudo systemctl disable NetworkManager
sudo systemctl mask NetworkManager

# Step 7: Configure Netplan
step_message 7 "Configuring Netplan with networkd renderer"
# Note: renderer is explicitly set to networkd here
sudo tee /etc/netplan/00-installer-config.yaml > /dev/null <<EOL
network:
  version: 2
  renderer: networkd
  ethernets:
    all-en:
      match:
        name: "en*"
      renderer: networkd
      dhcp4: true
    all-eth:
      match:
        name: "eth*"
      renderer: networkd
      dhcp4: true
EOL
sudo chmod 600 /etc/netplan/00-installer-config.yaml
# Clean up existing configs that might use NetworkManager
sudo rm -f /etc/netplan/50-cloud-init.yaml
sudo netplan apply

# Step 8: Disable Power Saving
step_message 8 "Disabling Power Saving and Sleep Targets"
progress_message "Masking sleep and suspend..."
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Step 9: DNS Fix
step_message 9 "Resolving DNS symlink issues"
sudo unlink /etc/resolv.conf
sudo ln -s /run/systemd/resolve/resolv.conf /etc/resolv.conf

# Step 10: Cloud-Init
step_message 10 "Disabling cloud-init network config"
echo "network: {config: disabled}" | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

echo "------------------------------------------------------------"
echo "   [+] Setup completed! System is now optimized for Domotz."
echo "   [+] IMPORTANT: NetworkManager is disabled. Use 'netplan apply' for changes."
echo "------------------------------------------------------------"
