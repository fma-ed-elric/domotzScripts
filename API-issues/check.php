<?php
/**
 * Domotz API - Collector Health Check Script
 * 
 * Queries the Domotz Public API to:
 *   1. Get all collectors (agents)
 *   2. Check each collector for IP conflicts
 *   3. Check each collector's device list for offline devices
 * 
 * Usage: php domotz_check.php
 * 
 * Configure your API key and endpoint below before running.
 */

// ─── Configuration ───────────────────────────────────────────────────────────
$config = [
    'api_key'  => 'YOUR_API_KEY_HERE',
    // Your API endpoint - adjust region as needed:
    //   US:     https://api-us-east-1-cell-1.domotz.com/public-api/v1
    //   EU:     https://api-eu-west-1-cell-1.domotz.com/public-api/v1
    'base_url' => 'https://api-us-east-1-cell-1.domotz.com/public-api/v1',
];

// ─── Helper: Make GET request to Domotz API ──────────────────────────────────
function domotzApiGet(string $url, string $apiKey): ?array
{
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'X-Api-Key: ' . $apiKey,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FAILONERROR    => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($error) {
        echo "  [ERROR] cURL error: $error\n";
        return null;
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        echo "  [ERROR] HTTP $httpCode for $url\n";
        return null;
    }

    $data = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "  [ERROR] Invalid JSON response\n";
        return null;
    }

    return $data;
}

// ─── Main ────────────────────────────────────────────────────────────────────

echo "=============================================================\n";
echo " Domotz Collector Health Check\n";
echo " " . date('Y-m-d H:i:s T') . "\n";
echo "=============================================================\n\n";

// 1. Get all agents (collectors)
echo "Fetching all collectors...\n";
$agents = domotzApiGet($config['base_url'] . '/agent', $config['api_key']);

if ($agents === null) {
    echo "[FATAL] Could not retrieve agent list. Check your API key and endpoint.\n";
    exit(1);
}

$agentCount = count($agents);
echo "Found $agentCount collector(s).\n\n";

if ($agentCount === 0) {
    echo "No collectors found. Nothing to check.\n";
    exit(0);
}

// Track summary results
$summary = [
    'total_agents'        => $agentCount,
    'agents_with_conflicts' => [],
    'offline_devices'       => [],
];

// 2 & 3. Iterate through each agent
foreach ($agents as $agent) {
    $agentId   = $agent['id'] ?? 'unknown';
    $agentName = $agent['display_name'] ?? $agent['name'] ?? 'Unnamed';
    $agentStatus = $agent['status']['value'] ?? 'UNKNOWN';
    $agentLastChange = $agent['status']['last_change'] ?? 'N/A';

    echo "-------------------------------------------------------------\n";
    echo "Collector: $agentName (ID: $agentId)\n";
    echo "  Status: $agentStatus (last change: $agentLastChange)\n";

    // Flag if the collector itself is offline
    if (strtoupper($agentStatus) !== 'ONLINE') {
        echo "  ⚠  COLLECTOR IS OFFLINE\n";
        $summary['offline_devices'][] = [
            'agent_id'    => $agentId,
            'agent_name'  => $agentName,
            'device_name' => '** COLLECTOR ITSELF **',
            'status'      => $agentStatus,
            'last_change' => $agentLastChange,
        ];
    }

    // ── Check IP Conflicts ───────────────────────────────────────────────
    echo "  Checking IP conflicts...\n";
    $conflicts = domotzApiGet(
        $config['base_url'] . "/agent/$agentId/ip-conflict",
        $config['api_key']
    );

    if ($conflicts !== null && count($conflicts) > 0) {
        echo "  ⚠  Found " . count($conflicts) . " IP conflict(s):\n";
        foreach ($conflicts as $conflict) {
            $ip      = $conflict['ip'] ?? 'unknown';
            $devices = $conflict['devices'] ?? [];
            $macs    = array_column($devices, 'mac');
            echo "    - IP: $ip  |  MACs: " . implode(', ', $macs) . "\n";
        }
        $summary['agents_with_conflicts'][] = [
            'agent_id'   => $agentId,
            'agent_name' => $agentName,
            'conflicts'  => $conflicts,
        ];
    } else {
        echo "  ✓  No IP conflicts.\n";
    }

    // ── Check Devices for Offline Status ─────────────────────────────────
    // Skip device check if the collector itself is offline (API won't return useful data)
    if (strtoupper($agentStatus) !== 'ONLINE') {
        echo "  Skipping device check (collector is offline).\n";
        continue;
    }

    echo "  Checking device statuses...\n";
    $devices = domotzApiGet(
        $config['base_url'] . "/agent/$agentId/device",
        $config['api_key']
    );

    if ($devices === null) {
        echo "  [WARN] Could not retrieve devices for this collector.\n";
        continue;
    }

    $offlineVitalCount = 0;
    $totalVital        = 0;
    foreach ($devices as $device) {
        $importance = strtoupper($device['importance'] ?? '');

        if ($importance !== 'VITAL') {
            continue;
        }

        $totalVital++;
        $deviceStatus = $device['status'] ?? 'UNKNOWN';

        if (strtoupper($deviceStatus) !== 'ONLINE') {
            $offlineVitalCount++;
            $deviceName    = $device['display_name'] ?? $device['user_data']['name'] ?? 'Unnamed';
            $deviceId      = $device['id'] ?? 'unknown';
            $deviceIp      = $device['ip_addresses'][0] ?? 'N/A';
            $deviceLastChg = $device['last_status_change'] ?? 'N/A';

            echo "    ⚠  VITAL device offline: $deviceName (ID: $deviceId, IP: $deviceIp)\n";

            $summary['offline_devices'][] = [
                'agent_id'    => $agentId,
                'agent_name'  => $agentName,
                'device_id'   => $deviceId,
                'device_name' => $deviceName,
                'device_ip'   => $deviceIp,
                'status'      => $deviceStatus,
                'last_change' => $deviceLastChg,
            ];
        }
    }

    $totalDevices   = count($devices);
    $onlineVital    = $totalVital - $offlineVitalCount;
    echo "  Devices: $totalDevices total | VITAL: $totalVital ($onlineVital online, $offlineVitalCount offline)\n";
}

// ─── Summary Report ──────────────────────────────────────────────────────────
echo "\n=============================================================\n";
echo " SUMMARY\n";
echo "=============================================================\n\n";

echo "Total Collectors: {$summary['total_agents']}\n\n";

// IP Conflicts Summary
$conflictCount = count($summary['agents_with_conflicts']);
if ($conflictCount > 0) {
    echo "⚠  IP CONFLICTS found on $conflictCount collector(s):\n";
    foreach ($summary['agents_with_conflicts'] as $entry) {
        echo "  - {$entry['agent_name']} (ID: {$entry['agent_id']}): "
            . count($entry['conflicts']) . " conflict(s)\n";
        foreach ($entry['conflicts'] as $c) {
            $ip   = $c['ip'] ?? 'unknown';
            $macs = array_column($c['devices'] ?? [], 'mac');
            echo "      IP $ip → " . implode(', ', $macs) . "\n";
        }
    }
} else {
    echo "✓  No IP conflicts detected on any collector.\n";
}

echo "\n";

// Offline VITAL Devices Summary
$offlineTotal = count($summary['offline_devices']);
if ($offlineTotal > 0) {
    echo "⚠  OFFLINE VITAL items ($offlineTotal):\n";
    foreach ($summary['offline_devices'] as $od) {
        $label = $od['device_name'];
        $ip    = $od['device_ip'] ?? '';
        $ipStr = $ip ? " ($ip)" : '';
        echo "  - [{$od['agent_name']}] $label$ipStr — Status: {$od['status']} since {$od['last_change']}\n";
    }
} else {
    echo "✓  All VITAL devices across all collectors are ONLINE.\n";
}

echo "\nDone.\n";
