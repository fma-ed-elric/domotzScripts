/**
 * Peplink InControl2 Check-in Monitor
 * Monitors if the device is checking into InControl2
 */

// --- Configuration ---
// It is best to set these as "Parameters" in the Domotz UI
var orgId = D.getParameter("organization_id"); // Your Peplink Org ID
var deviceId = D.getParameter("device_id");     // Your Peplink Device ID
var apiToken = D.getParameter("access_token"); // Your IC2 API Access Token

// --- Script Logic ---
function get_status() {
    // Create an external device object to point to the Peplink Cloud API
    var ic2Client = D.createExternalDevice("incontrol2.peplink.com");

    // IC2 API Endpoint for specific device info
    var path = "/rest/o/" + orgId + "/d/" + deviceId;

    ic2Client.http.get({
        url: path,
        headers: {
            "Authorization": "Bearer " + apiToken,
            "Accept": "application/json"
        }
    }, function(err, response, body) {
        if (err) {
            console.error("HTTP Error: " + err);
            D.failure(D.errorType.GENERIC_ERROR);
            return;
        }

        if (response.statusCode !== 200) {
            console.error("API Error: Status Code " + response.statusCode);
            D.failure(D.errorType.AUTHENTICATION_ERROR);
            return;
        }

        var data = JSON.parse(body);
        
        // Peplink IC2 response usually contains 'online_status' and 'last_seen'
        // These field names may vary slightly based on Peplink API versions
        var status = data.online_status || "unknown";
        var lastSeenTimestamp = data.last_seen || 0; 
        
        // Calculate minutes since last check-in
        var lastSeenDate = new Date(lastSeenTimestamp * 1000);
        var now = new Date();
        var diffMinutes = Math.floor((now - lastSeenDate) / 1000 / 60);

        // Create Domotz Variables
        var vStatus = D.createVariable("ic2_status", "InControl Status", status, null, D.valueType.STRING);
        var vLastSeen = D.createVariable("last_seen_min", "Minutes Since Check-in", diffMinutes, "min", D.valueType.NUMBER);

        // Optional: Trigger a failure if the device hasn't checked in for > 30 mins
        if (diffMinutes > 30) {
            console.warn("Device has not checked into IC2 for " + diffMinutes + " minutes.");
        }

        D.success([vStatus, vLastSeen]);
    });
}

// Domotz entry point
function validate() {
    get_status();
}
