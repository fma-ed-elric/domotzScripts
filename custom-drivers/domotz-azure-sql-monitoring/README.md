# Domotz Custom Driver — Azure SQL Database Monitoring

Monitors Azure SQL Databases via the Azure REST API, surfacing performance metrics into a Domotz table.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `tenantId` | String | Azure Active Directory Tenant ID |
| `clientId` | String | Service Principal Application (Client) ID |
| `clientSecret` | Secret | Service Principal Client Secret |
| `subscriptionId` | String | Azure Subscription ID |
| `resourceGroups` | String | Comma-separated resource group names to filter by. Leave empty or `all` for no filter. |
| `sqlServers` | String | Comma-separated SQL server names to filter by. Leave empty or `all` for no filter. |

## Required Azure Permissions

The Service Principal must have **Monitoring Reader** (or equivalent) on the target subscription.

## Metrics Collected

Each database row includes:

| Column | Description |
|---|---|
| Database Name | Name of the Azure SQL Database |
| Server Name | Parent SQL server name |
| Resource Group | Resource group containing the database |
| Location | Azure region |
| Status | Database status (Online, Offline, etc.) |
| SKU Name | e.g., `GP_Gen5` |
| SKU Tier | e.g., `GeneralPurpose` |
| Pricing Tier | Combined display, e.g., `GP_Gen5 (GeneralPurpose)` |
| CPU Percent | Average CPU utilization (vCore-based databases) |
| DTU Percent | Average DTU utilization (DTU-based databases) |
| Data I/O Percent | Average physical data read percent |
| Successful Connections | Total successful connections over the interval |
| Failed Connections | Total failed connections over the interval |

> CPU Percent and DTU Percent are mutually exclusive — the driver automatically selects the correct metric based on the database's SKU tier.

## System Databases

The following system databases are automatically excluded: `master`, `model`, `msdb`, `tempdb`.

## API Versions Used

| API | Version |
|---|---|
| SQL Servers | `2022-11-01-preview` |
| SQL Databases | `2022-11-01-preview` |
| Monitor Metrics | `2023-10-01` |
