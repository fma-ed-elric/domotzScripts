# UPS SNMP Shutdown

## Description

This Domotz Custom Driver remotely checks the runtime of a UPS via SNMP. If the runtime is below a specified threshold, it can trigger a shutdown of a target machine via SSH. The script uses exit codes to report the action taken (e.g., shutdown initiated, dry run, error).

## Prerequisites

*   Domotz Pro agent.
*   An SSH server on the target machine that needs to be shut down.
*   A UPS with SNMPv1 enabled.
*   `snmpget` installed on the target machine.

## Usage

1.  Configure the script parameters at the top of the file (`TARGET_HOST`, `SSH_USERNAME`, `SSH_PASSWORD`, `UPS_IP`, `COMMUNITY`, `RUNTIME_OID`, `THRESHOLD_MIN`, etc.).
2.  Upload the script to your Domotz agent.
3.  The script will run and report the "Action Taken" and "SSH Exit Code" as metrics.
