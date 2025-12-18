/**
 * Domotz Custom Driver
 * Name: ESXi Snapshot Monitor
 * Description: Checks if VMs are running on snapshots using the working SOAP structure.
 **/

const url = '/sdk';

// Table to store Snapshot status
var table = D.createTable(
  'VM Snapshot Status',[
    { label: 'Name', valueType: D.valueType.STRING},
    { label: 'Power State', valueType: D.valueType.STRING },
    { label: 'Running on Snapshot', valueType: D.valueType.STRING }
  ]
);

function sendSoapRequest (body, extractData) {
  const d = D.q.defer();
  const config ={
    url,
    protocol: 'https',
    body,
    jar: true,
    rejectUnauthorized: false
  };
  D.device.http.post(config, function (error, response, body) {
    if (error) {
      console.error(error);
      D.failure(D.errorType.GENERIC_ERROR);
    }
    const $ = D.htmlParse(body);
    const faultString = $('faultstring').text();
    if (faultString) {
      console.error("SOAP Fault: " + faultString);
      D.failure(D.errorType.GENERIC_ERROR);
    } else if (response.statusCode !== 200) {
      D.failure(D.errorType.GENERIC_ERROR);
    } else {
      const result = extractData(body);
      d.resolve(result);
    }
  });
  return d.promise;
}

function createSoapPayload (soapBody) {
  return '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25"><soapenv:Body>'
         + soapBody + '</soapenv:Body></soapenv:Envelope>';
}

function login () {
  const payload = createSoapPayload(
    '<vim25:Login>' +
    '  <vim25:_this type="SessionManager">ha-sessionmgr</vim25:_this>' +
    '  <vim25:userName>' + D.device.username() + '</vim25:userName>' +
    '  <vim25:password>' + D.device.password() + '</vim25:password>' +
    '</vim25:Login>'
  );
  return sendSoapRequest(payload, function(body) {
    return D.htmlParse(body)('returnval').find('key').first().text();
  });
}

/**
 * Step 1: Get the list of all VM IDs from the VM Folder
 */
function retrieveVMList() {
  const payload = createSoapPayload(
    '<vim25:RetrieveProperties>' +
    '  <vim25:_this type="PropertyCollector">ha-property-collector</vim25:_this>' +
    '  <vim25:specSet>' +
    '    <vim25:propSet>' +
    '      <vim25:type>Folder</vim25:type>' +
    '      <vim25:pathSet>childEntity</vim25:pathSet>' +
    '    </vim25:propSet>' +
    '    <vim25:objectSet>' +
    '      <vim25:obj type="Folder">ha-folder-vm</vim25:obj>' +
    '      <vim25:skip>false</vim25:skip>' +
    '    </vim25:objectSet>' +
    '  </vim25:specSet>' +
    '</vim25:RetrieveProperties>' 
  );
  return sendSoapRequest(payload, function(body) {
    const $ = D.htmlParse(body);
    return $('ManagedObjectReference[type="VirtualMachine"]').map(function() {
      return $(this).text();
    }).get();
  });
}

/**
 * Step 2: Query name, powerState, and snapshot for each ID found
 */
function retrieveSnapshotDetails(vmIds) {
  if (!vmIds || vmIds.length === 0) {
    D.success(table);
    return;
  }

  const objectSets = vmIds.map(function(id) { 
    return '<vim25:objectSet><vim25:obj type="VirtualMachine">' + id + '</vim25:obj></vim25:objectSet>';
  }).join('');

  const payload = createSoapPayload(
    '<vim25:RetrieveProperties>' + 
    '  <vim25:_this type="PropertyCollector">ha-property-collector</vim25:_this>' + 
    '  <vim25:specSet>' + 
    '    <vim25:propSet>' + 
    '      <vim25:type>VirtualMachine</vim25:type>' + 
    '      <vim25:pathSet>name</vim25:pathSet>' +
    '      <vim25:pathSet>runtime.powerState</vim25:pathSet>' +
    '      <vim25:pathSet>snapshot</vim25:pathSet>' +
    '    </vim25:propSet>' + 
    objectSets +
    '  </vim25:specSet>' + 
    '</vim25:RetrieveProperties>' 
  );
  return sendSoapRequest(payload, parseResults);
}

function parseResults(body) {
  const $ = D.htmlParse(body);
  
  $('returnval').each(function() {
    const vmRef = $(this);
    const recordId = vmRef.find('obj').text();
    
    let name = "Unknown";
    let powerState = "Unknown";
    let hasSnapshotProp = false;

    vmRef.find('propSet').each(function() {
      const pName = $(this).find('name').text();
      const pVal = $(this).find('val');

      if (pName === 'name') name = pVal.text();
      if (pName === 'runtime.powerState') powerState = pVal.text();
      if (pName === 'snapshot') hasSnapshotProp = true;
    });

    let snapshotStatus = "No";
    if (hasSnapshotProp && powerState === 'poweredOn') {
      snapshotStatus = "YES ⚠️";
    } else if (hasSnapshotProp) {
      snapshotStatus = "Paused (Snapshot Exists)";
    }

    table.insertRecord(recordId, [name, powerState, snapshotStatus]);
  });

  D.success(table);
}

function validate() {
  login()
    .then(retrieveVMList)
    .then(function(vms) {
      if (vms.length >= 0) D.success();
    })
    .catch(function() {
      D.failure(D.errorType.GENERIC_ERROR);
    });
}

function get_status() {
  login()
    .then(retrieveVMList)
    .then(retrieveSnapshotDetails)
    .catch(function(err) {
      console.error(err);
      D.failure(D.errorType.GENERIC_ERROR);
    });
}
