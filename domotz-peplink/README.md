# Peplink InControl2 Check-in Monitor

## Description

This Domotz Custom Driver monitors a Peplink device's check-in status with the Peplink InControl2 cloud platform. It retrieves the device's online status and the time since it last checked in.

## Prerequisites

*   Domotz Pro agent.
*   Peplink InControl2 API credentials:
    *   Organization ID
    *   Device ID
    *   API Access Token

## Usage

1.  Upload the script to your Domotz agent.
2.  Set the `organization_id`, `device_id`, and `access_token` as parameters in the Domotz UI.
3.  The script will create two variables: "InControl Status" and "Minutes Since Check-in".
