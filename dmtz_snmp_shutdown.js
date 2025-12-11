/**
 * Name: UPS Runtime via SSH (ECMA-5.1) — Action via Exit Code
 * Purpose: Make shutdown decision remotely; report "Action Taken" by mapping the SSH exit code.
 *
 * Exit code contract (from remote script):
 *   0  -> none (no shutdown)
 *   10 -> would_shutdown_dry_run
 *   11 -> shutdown_initiated
 *   12 -> invalid_runtime
 *   13 -> no_snmpget
 *   14 -> snmp_error (no response / empty)
 *   else -> error
 */

/* ========== User parameters ========== */
var PARAMS = {
  TARGET_HOST:     "",      // Leave empty to use the current device; or set IP/FQDN for external host
  SSH_PORT:        22,
  SSH_USERNAME:    "",
  SSH_PASSWORD:    "",
  SSH_TIMEOUT_MS:  20000,

  // UPS SNMP settings
  UPS_IP:          "192.168.98.2",
  COMMUNITY:       "public",
  RUNTIME_OID:     "1.3.6.1.2.1.2.1.0",

  // Logic controls
  THRESHOLD_MIN:   4200,
  DRY_RUN:         true,    // true = only log, no shutdown
  USE_SUDO:        true,    // true if sudoers allows NOPASSWD
  SUDO_NOPASS:     true,    // true => use 'sudo -n'
  SHUTDOWN_CMD:    "shutdown -h now"
};

/* ========== Helpers ========== */
function escForOuterDq(s){
  return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\$/g,'\\$');
}
function sq(s){ return "'" + String(s).replace(/'/g,"'\\''") + "'"; }

/**
 * Remote script:
 * - SNMP (v1) query with -Oqv to get value-only
 * - Compares to THRESHOLD
 * - Exits with specific code (see contract above)
 * - If issuing real shutdown, uses nohup so controller can still get exit code
 */
function buildRemoteCommand(p){
  var script =
      "PATH=/usr/bin:/bin:/usr/local/bin; "
    + "UPS_IP="        + sq(p.UPS_IP)        + "; "
    + "COMMUNITY="     + sq(p.COMMUNITY)     + "; "
    + "RUNTIME_OID="   + sq(p.RUNTIME_OID)   + "; "
    + "THRESHOLD="     + (Number(p.THRESHOLD_MIN)) + "; "
    + "SNMP_VERSION='1'; "
    + "DRY_RUN="       + (p.DRY_RUN ? 1 : 0) + "; "
    + "USE_SUDO="      + (p.USE_SUDO ? 1 : 0) + "; "
    + "SUDO_NOPASS="   + (p.SUDO_NOPASS ? 1 : 0) + "; "
    + "SHUTDOWN_CMD="  + sq(p.SHUTDOWN_CMD || "shutdown -h now") + "; "
    // 13: snmpget missing
    + "if ! command -v snmpget >/dev/null 2>&1; then exit 13; fi; "
    // value-only output; tolerate command error without aborting shell
    + "OUT=$(snmpget -v\"$SNMP_VERSION\" -c \"$COMMUNITY\" -Oqv \"$UPS_IP\" \"$RUNTIME_OID\" 2>/dev/null) || true; "
    + "RUNTIME_RAW=$(printf \"%s\" \"$OUT\" | tr -d '\\r' | tr -d '\\n'); "
    // 14: empty output, 12: not numeric
    + "if [ -z \"$RUNTIME_RAW\" ]; then exit 14; fi; "
    + "echo \"$RUNTIME_RAW\" | grep -qE '^[0-9]+$' || exit 12; "
    + "RUNTIME_MIN=$RUNTIME_RAW; "
    // compare to threshold
    + "if [ \"$RUNTIME_MIN\" -lt \"$THRESHOLD\" ]; then "
    + "  if [ \"$DRY_RUN\" -eq 1 ]; then "
    + "    exit 10; "
    + "  else "
    + "    CMD=\"$SHUTDOWN_CMD\"; "
    + "    if [ \"$USE_SUDO\" -eq 1 ]; then "
    + "      if [ \"$SUDO_NOPASS\" -eq 1 ]; then CMD=\"sudo -n $SHUTDOWN_CMD\"; else CMD=\"sudo $SHUTDOWN_CMD\"; fi; "
    + "    fi; "
    + "    nohup sh -c \"$CMD\" >/dev/null 2>&1 & "
    + "    exit 11; "
    + "  fi; "
    + "fi; "
    + "exit 0;";

  // Use bash -c; capture stderr as well (we don't rely on stdout)
  return 'bash -c "' + escForOuterDq(script) + '" 2>&1';
}

function mapExitCodeToAction(code){
  switch (Number(code)) {
    case 0:  return "none";
    case 10: return "would_shutdown_dry_run";
    case 11: return "shutdown_initiated";
    case 12: return "invalid_runtime";
    case 13: return "no_snmpget";
    case 14: return "snmp_error";
    default: return "error";
  }
}

/** Extract exit code from either res or err (Domotz may put it in err.code) */
function extractExitCode(res, err) {
  var fields = ["exitCode", "code", "statusCode"];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (res && typeof res[f] !== "undefined") return Number(res[f]);
  }
  for (var j = 0; j < fields.length; j++) {
    var g = fields[j];
    if (err && typeof err[g] !== "undefined") return Number(err[g]);
  }
  return null;
}

/* ========== Metrics ========== */
function toMetrics(action, exitCode){
  var m = [ D.createMetric({ uid: "action_taken", name: "Action Taken", value: action }) ];
  if (typeof exitCode === "number") {
    m.push(D.createMetric({ uid: "ssh_exit_code", name: "SSH Exit Code", value: String(exitCode) }));
  }
  return m;
}

function pickTargetDevice(p){
  if (p.TARGET_HOST && String(p.TARGET_HOST).trim() !== "") {
    var creds = {};
    if (p.SSH_USERNAME) creds.username = p.SSH_USERNAME;
    if (p.SSH_PASSWORD) creds.password = p.SSH_PASSWORD;
    return D.createExternalDevice(String(p.TARGET_HOST), creds);
  }
  return D.device;
}

/* ========== Entry points ========== */
function validate(){
  var p = PARAMS, tgt = pickTargetDevice(p);
  tgt.sendSSHCommand({
    command: "echo VALIDATE_OK",
    timeout: Number(p.SSH_TIMEOUT_MS) || 20000,
    username: p.SSH_USERNAME || undefined,
    password: p.SSH_PASSWORD || undefined,
    port: String(p.SSH_PORT || 22)
  }, function(res, err){
    if (err) return D.failure(D.errorType.GENERIC_ERROR);
    return D.success();
  });
}

function get_status(){
  var p = PARAMS, tgt = pickTargetDevice(p), command = buildRemoteCommand(p);
  tgt.sendSSHCommand({
    command: command,
    timeout: Number(p.SSH_TIMEOUT_MS) || 20000,
    username: p.SSH_USERNAME || undefined,
    password: p.SSH_PASSWORD || undefined,
    port: String(p.SSH_PORT || 22)
  }, function(res, err){
    var code = extractExitCode(res, err);
    var action;

    if (code !== null) {
      action = mapExitCodeToAction(code);
    } else if (err) {
      action = "ssh_error";
    } else {
      // Very unlikely, but provide a sane fallback
      action = "none";
    }

    return D.success(toMetrics(action, code));
  });
}
