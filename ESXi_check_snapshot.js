/**
 * Domotz Custom Driver
 * Name: ESXi Snapshot Monitor with Age Tracking
 * Description: Detects snapshots and calculates how many days they have been active.
 **/

const url = '/sdk';

// Table with new "Snapshot Age" column
var table = D.createTable(
  'VM Snapshot Status',[
    { label: 'Name', valueType: D.valueType.STRING},
    { label: 'Power State', valueType: D.valueType.STRING },
    { label: 'Running on Snapshot', valueType: D.valueType.STRING },
    { label: 'Snapshot Age', valueType: D.valueType.NUMBER, unit: 'Days' }
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
    if (error) { D.failure(D.errorType.GENERIC_ERROR); }
    const $ = D.htmlParse(body);
    if ($('faultstring').text()) { D.failure(D.errorType.GENERIC_ERROR); }
    else if (response.statusCode !== 200) { D.failure(D.errorType.GENERIC_ERROR); }
    else { d.resolve(extractData(body)); }
  });
  return d.promise;
}

function createSoapPayload (soapBody) {
  return '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25"><soapenv:Body>'
         + soapBody + '</soapenv:Body></soapenv:Envelope>';
}

function login () {
  const payload = createSoapPayload(
    '<vim25:Login><_this type="SessionManager">ha-sessionmgr</_this>' +
    '<userName>' + D.device.username() + '</userName>' +
    '<password>' + D.device.password() + '</password></vim25:Login>'
  );
  return sendSoapRequest(payload, function(body) {
    return D.htmlParse(body)('returnval').find('key').first().text();
  });
}

function retrieveVMList() {
  const payload = createSoapPayload(
    '<vim25:RetrieveProperties><_this type="PropertyCollector">ha-property-collector</_this>' +
    '<specSet><propSet><type>Folder</type><pathSet>childEntity</pathSet></propSet>' +
    '<objectSet><obj type="Folder">ha-folder-vm</obj><skip>false</skip></objectSet></specSet></vim25:RetrieveProperties>' 
  );
  return sendSoapRequest(payload, function(body) {
    const $ = D.htmlParse(body);
    return $('ManagedObjectReference[type="VirtualMachine"]').map(function() { return $(this).text(); }).get();
  });
}

function retrieveSnapshotDetails(vmIds) {
  if (!vmIds || vmIds.length === 0) { D.success(table); return; }
  const objectSets = vmIds.map(function(id) { 
    return '<vim25:objectSet><vim25:obj type="VirtualMachine">' + id + '</vim25:obj></vim25:objectSet>';
  }).join('');

  const payload = createSoapPayload(
    '<vim25:RetrieveProperties><_this type="PropertyCollector">ha-property-collector</_this>' + 
    '<specSet><propSet><type>VirtualMachine</type>' +
    '<pathSet>name</pathSet><pathSet>runtime.powerState</pathSet><pathSet>snapshot</pathSet></propSet>' + 
    objectSets + '</specSet></vim25:RetrieveProperties>' 
  );
  return sendSoapRequest(payload, parseResults);
}

function parseResults(body) {
    const $ = D.htmlParse(body);
    
    $('returnval').each(function() {
        const vmRef = $(this);
        const recordId = vmRef.find('obj').text();
        const rawXml = vmRef.html().toLowerCase();
        
        let name = "Unknown";
        let powerState = "Unknown";
        let hasSnapshot = (rawXml.indexOf('currentsnapshot') !== -1 || rawXml.indexOf('rootsnapshotlist') !== -1);
        let snapshotAgeDays = 0;

        vmRef.find('propset, propSet').each(function() {
            const pName = $(this).find('name').text().toLowerCase();
            const pVal = $(this).find('val');
            if (pName === 'name') name = pVal.text();
            if (pName === 'runtime.powerstate') powerState = pVal.text();
        });

        if (hasSnapshot) {
            // Extract the creation time from the XML
            // Pattern: <createtime>2025-12-18T16:23:32...</createtime>
            const createTimeMatch = rawXml.match(/<createtime>([^<]+)<\/createtime>/);
            if (createTimeMatch && createTimeMatch[1]) {
                const createdDate = new Date(createTimeMatch[1]);
                const now = new Date();
                const diffMs = now - createdDate;
                // Convert milliseconds to days (rounded to 2 decimal places)
                snapshotAgeDays = (diffMs / (1000 * 60 * 60 * 24)).toFixed(2);
            }
        }

        let snapshotStatus = "No";
        if (hasSnapshot && powerState === 'poweredOn') {
            snapshotStatus = "YES ⚠️";
        } else if (hasSnapshot) {
            snapshotStatus = "Paused (Snapshot Exists)";
        }

        // Insert: Name, Power, Status, Age
        table.insertRecord(recordId, [name, powerState, snapshotStatus, hasSnapshot ? snapshotAgeDays : 0]);
    });

    D.success(table);
}

function validate() {
  login().then(retrieveVMList).then(function(vms) { if (vms) D.success(); }).catch(function() { D.failure(D.errorType.GENERIC_ERROR); });
}

function get_status() {
  login().then(retrieveVMList).then(retrieveSnapshotDetails).catch(function(err) { D.failure(D.errorType.GENERIC_ERROR); });
}
