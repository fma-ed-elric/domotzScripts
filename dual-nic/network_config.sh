#!/bin/bash
# DISCLAIMER: 
# This script is provided "AS IS" and is intended solely for illustrative or educational purposes. 
# Domotz makes no warranties, express or implied, including but not limited to warranties of merchantability,
# fitness for a particular purpose, or non-infringement. Use of this script is at your own risk.
ver="1.2"

NETPLAN_FILE="/etc/netplan/00-installer-config.yaml"

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root"
    exit 1
fi

validate_ip() {
    local ip_with_mask=$1
    local ip=${ip_with_mask%%/*}
    local mask=${ip_with_mask##*/}
    if [[ $ip =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        IFS='.' read -r -a octets <<< "$ip"
        for octet in "${octets[@]}"; do
            if ((octet < 0 || octet > 255)); then return 1; fi
        done
    else
        return 1
    fi
    if [[ $ip_with_mask == */* ]]; then
        if ! [[ $mask =~ ^[0-9]{1,2}$ ]] || ((mask < 16 || mask > 32)); then return 1; fi
    fi
    return 0
}

add_subnet_mask() {
    local ip=$1
    if [[ ! $ip =~ /[0-9]{1,2}$ ]]; then ip="${ip}/24"; fi
    echo "$ip"
}

validate_interface() {
    ip -o link show | awk -F': ' '{print $2}' | grep -v lo | grep -wq "$1"
}

configure_interface() {
    local num=$1
    echo ""
    echo "========================================"
    echo "  Configuring Interface #${num}"
    echo "========================================"
    echo "Available interfaces:"
    ip -o link show | awk -F': ' '{print $2}' | grep -v lo
    echo "========================"

    while true; do
        read -p "Enter interface #${num} name: " iface
        if ! validate_interface "$iface"; then
            printf "Interface not found.\n" >&2
        elif [[ $num -gt 1 && "$iface" == "${IFACE_1}" ]]; then
            printf "Already used as interface #1. Choose a different one.\n" >&2
        else
            break
        fi
    done
    echo "========================"

    while true; do
        read -p "Use DHCP for ${iface}? (yes/no): " dhcp
        if [[ $dhcp == "yes" || $dhcp == "no" ]]; then break
        else printf "Please enter 'yes' or 'no'.\n" >&2; fi
    done
    echo "========================"

    local ip="" gateway="" dns1="" dns2=""
    if [[ $dhcp == "no" ]]; then
        while true; do
            read -p "Static IP for ${iface} (e.g., 192.168.1.10 or 192.168.1.10/24): " ip
            ip=$(add_subnet_mask "$ip")
            if validate_ip "$ip"; then break
            else printf "Invalid IP or mask (must be /16-/32).\n" >&2; fi
        done
        echo "========================"
        while true; do
            read -p "Gateway for ${iface}: " gateway
            if validate_ip "${gateway}"; then break
            else printf "Invalid gateway IP.\n" >&2; fi
        done
        echo "========================"
        while true; do
            read -p "Primary DNS for ${iface}: " dns1
            if validate_ip "${dns1}"; then break
            else printf "Invalid DNS IP.\n" >&2; fi
        done
        echo "========================"
        while true; do
            read -p "Secondary DNS for ${iface}: " dns2
            if validate_ip "${dns2}"; then break
            else printf "Invalid DNS IP.\n" >&2; fi
        done
        echo "========================"
    fi

    eval "IFACE_${num}=\"$iface\""
    eval "DHCP_${num}=\"$dhcp\""
    eval "IP_${num}=\"$ip\""
    eval "GW_${num}=\"$gateway\""
    eval "DNS1_${num}=\"$dns1\""
    eval "DNS2_${num}=\"$dns2\""
}

write_interface_block() {
    local num=$1
    local iface dhcp ip gateway dns1 dns2
    eval "iface=\"\${IFACE_${num}}\""
    eval "dhcp=\"\${DHCP_${num}}\""
    eval "ip=\"\${IP_${num}}\""
    eval "gateway=\"\${GW_${num}}\""
    eval "dns1=\"\${DNS1_${num}}\""
    eval "dns2=\"\${DNS2_${num}}\""

    printf "    %s:\n      dhcp4: %s\n" "$iface" "$dhcp" >> "${NETPLAN_FILE}.tmp"
    if [[ $dhcp == "no" ]]; then
        printf "      addresses:\n        - %s\n      routes:\n        - to: default\n          via: %s\n      nameservers:\n        addresses:\n          - %s\n          - %s\n" \
            "$ip" "$gateway" "$dns1" "$dns2" >> "${NETPLAN_FILE}.tmp"
    fi
}

make_backup() {
    local file=$1 i=1
    local backup_dir; backup_dir=$(dirname "$file")
    local backup_name; backup_name=$(basename "$file")
    if [[ ! -f "$file" ]]; then echo "No existing file to back up."; return; fi
    while [[ -f "$backup_dir/${backup_name}.bak$i" ]]; do let i++; done
    cp "$file" "$backup_dir/${backup_name}.bak$i"
    echo "Backup saved as ${backup_name}.bak$i"
}

# ---- MAIN ----

echo "Current interfaces:"
ip -o link show | awk -F': ' '{print $2}' | grep -v lo
echo "========================"

while true; do
    read -p "How many interfaces to configure? (1 or 2): " NUM_INTERFACES
    if [[ $NUM_INTERFACES == "1" || $NUM_INTERFACES == "2" ]]; then break
    else printf "Please enter 1 or 2.\n" >&2; fi
done

for i in $(seq 1 "$NUM_INTERFACES"); do
    configure_interface "$i"
done

# Build netplan tmp file from scratch
printf "network:\n  version: 2\n  ethernets:\n" > "${NETPLAN_FILE}.tmp"
for i in $(seq 1 "$NUM_INTERFACES"); do
    write_interface_block "$i"
done

echo ""
echo "========================================"
echo "Preview of new netplan configuration:"
echo "========================================"
cat "${NETPLAN_FILE}.tmp"
echo "========================"

read -p "Apply these settings? (yes/no): " confirm
if [[ $confirm == "yes" ]]; then
    make_backup "$NETPLAN_FILE"
    if mv "${NETPLAN_FILE}.tmp" "$NETPLAN_FILE"; then
        echo "Written to $NETPLAN_FILE. Run 'sudo netplan apply' to activate."
    else
        echo "Error: Failed to write to $NETPLAN_FILE." >&2
        exit 1
    fi
else
    echo "Changes not applied."
    rm -f "${NETPLAN_FILE}.tmp"
    exit 0
fi
echo "========================"
