/**
 * Domotz Custom Driver
 * Name: Azure SQL Database Monitoring
 * Description:  .
 * Version: 1.1.1 (ES5.1 Compatible, removed D.isFailure)
 *
 * Communication protocol is HTTPS
 *
 * Creates Custom Driver table with the following columns:
 * - Database Name
 * - Server Name
 * - Resource Group
 * - Location
 * - Status (Online, Offline, etc.)
 * - SKU Name (e.g., GP_Gen5)
 * - SKU Tier (e.g., GeneralPurpose)
 * - Pricing Tier (e.g., GP_Gen5 (GeneralPurpose))
 * - CPU Percent (or DTU Percent, depending on the model)
 * - Data I/O Percent
 * - Log Write Percent
 * - Storage Percent
 * - Sessions Percent
 * - Deadlocks
 * - Successful Connections
 * - Failed Connections
 * - Workers Percent
 *
 * Uses Azure REST APIs for data retrieval.
 * Required Azure permissions for the Service Principal: "Monitoring Reader" or equivalent on the subscription.
 */

// Parameters for Azure authentication (to be configured in Domotz)
var tenantId = D.getParameter('tenantId');
var clientId = D.getParameter('clientId'); // Also known as Application ID
var clientSecret = D.getParameter('clientSecret'); // Also known as Application Secret or App Secret
var subscriptionId = D.getParameter('subscriptionId');

// Optional: Filter by resource groups (comma-separated string). E.g., "rg-prod,rg-dev". Leave empty or set to "all" for all.
var resourceGroupFilterInput = D.getParameter('resourceGroups');

// Optional: Filter by specific SQL server names (comma-separated string). E.g., "sqlserverprod,sqlserverdev". Leave empty or set to "all" for all.
var sqlServerFilterInput = D.getParameter('sqlServers');


// Azure API Versions (verify and update if necessary from Azure documentation)
var API_VERSION_SQL_SERVERS = "2022-11-01-preview";
var API_VERSION_SQL_DATABASES = "2022-11-01-preview";
var API_VERSION_MONITOR_METRICS = "2023-10-01";


// Create external devices for Azure login and management services
var azureCloudLoginService = D.createExternalDevice('login.microsoftonline.com');
var azureCloudManagementService = D.createExternalDevice('management.azure.com');

// Global variable for Azure access token
var accessToken;
// Global variable for the Domotz table
var azureSqlDbTable;

// Define the metrics to retrieve for Azure SQL Databases
var sqlDatabaseMetricsList = [
    { label: 'CPU Percent', valueType: D.valueType.NUMBER, unit: '%', key: 'cpu_percent', aggregation: 'average' },
    { label: 'DTU Percent', valueType: D.valueType.NUMBER, unit: '%', key: 'dtu_consumption_percent', aggregation: 'average' },
    { label: 'Data I/O Percent', valueType: D.valueType.NUMBER, unit: '%', key: 'physical_data_read_percent', aggregation: 'average' },
    { label: 'Successful Connections', valueType: D.valueType.NUMBER, unit: '', key: 'connection_successful', aggregation: 'total' },
    { label: 'Failed Connections', valueType: D.valueType.NUMBER, unit: '', key: 'connection_failed', aggregation: 'total' },
];

// Define columns for the Domotz table
var sqlDatabaseTableColumns = [
    { label: 'Database Name', valueType: D.valueType.STRING },
    { label: 'Server Name', valueType: D.valueType.STRING },
    { label: 'Resource Group', valueType: D.valueType.STRING },
    { label: 'Location', valueType: D.valueType.STRING },
    { label: 'Status', valueType: D.valueType.STRING },
    { label: 'SKU Name', valueType: D.valueType.STRING },
    { label: 'SKU Tier', valueType: D.valueType.STRING },
    { label: 'Pricing Tier', valueType: D.valueType.STRING }
].concat(sqlDatabaseMetricsList.map(function(metric) {
    return {
        label: metric.label,
        valueType: metric.valueType,
        unit: metric.unit || null
    };
}));


/**
 * Helper function to check for HTTP errors and trigger Domotz failure modes.
 */
function checkHTTPError(error, response, context) {
    var prefix = context ? "Error in " + context + ": " : "Error: ";
    var errorMessage = prefix;

    if (error) {
        errorMessage += error.message || "Unknown error.";
        console.error(errorMessage, error);
        D.failure(D.errorType.GENERIC_ERROR);
    } else if (response) {
        var statusCode = response.statusCode;
        var requestUri = response.request && response.request.uri ? response.request.uri.href : "N/A";
        errorMessage += "HTTP " + statusCode + ". URI: " + requestUri + ".";
        if (response.body) {
            errorMessage += " Body: " + (typeof response.body === 'string' ? response.body.substring(0, 200) : JSON.stringify(response.body).substring(0,200));
        }
        console.error(errorMessage);

        if (statusCode === 404) {
            D.failure(D.errorType.RESOURCE_UNAVAILABLE);
        } else if (statusCode === 401) {
            D.failure(D.errorType.AUTHENTICATION_ERROR);
        } else if (statusCode === 403) {
            D.failure(D.errorType.AUTHORIZATION_ERROR);
        } else if (statusCode < 200 || statusCode >= 300) {
            D.failure(D.errorType.GENERIC_ERROR);
        }
    } else {
        console.error(prefix + "Unknown issue, no error or response object.");
        D.failure(D.errorType.GENERIC_ERROR);
    }
}


/**
 * Processes the Azure login response to extract the access token.
 */
function processLoginResponse(deferred) {
    return function process(error, response, body) {
        if (error || (response && response.statusCode !== 200)) {
            checkHTTPError(error, response, "Azure Login");
            deferred.reject(error || (response ? response.body : "Login failed without response body"));
            return;
        }
        try {
            var bodyAsJSON = JSON.parse(body);
            if (bodyAsJSON.access_token) {
                accessToken = bodyAsJSON.access_token;
                deferred.resolve();
            } else {
                console.error('Access token not found in login response body.');
                D.failure(D.errorType.AUTHENTICATION_ERROR);
                deferred.reject('Access token not found.');
            }
        } catch (parseError) {
            console.error("Error parsing login response: " + parseError, body);
            D.failure(D.errorType.GENERIC_ERROR);
            deferred.reject(parseError);
        }
    };
}

/**
 * Authenticates with Azure to get an access token.
 */
function loginToAzure() {
    var deferred = D.q.defer();
    var config = {
        url: '/' + tenantId + '/oauth2/token',
        protocol: 'https',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        form: {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            resource: 'https://management.azure.com/'
        },
        rejectUnauthorized: false,
        jar: true
    };
    azureCloudLoginService.http.post(config, processLoginResponse(deferred));
    return deferred.promise;
}

/**
 * Generates the configuration for Azure Management API requests.
 */
function generateAzureApiConfig(path, apiVersion) {
    var fullPath = path;
    if (apiVersion) {
        fullPath += (path.indexOf('?') === -1 ? '?' : '&') + 'api-version=' + apiVersion;
    }
    return {
        url: fullPath,
        protocol: 'https',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false,
        jar: true
    };
}

/**
 * Parses a comma-separated filter string into a lowercase array.
 */
function parseFilterInput(filterInput) {
    if (!filterInput || filterInput.trim().toLowerCase() === 'all' || filterInput.trim() === "") {
        return [];
    }
    return filterInput.split(',').map(function(item) {
        return item.trim().toLowerCase();
    });
}


/**
 * Retrieves a list of SQL servers from Azure, applying filters.
 */
function listSqlServers() {
    var deferred = D.q.defer();
    var path = '/subscriptions/' + subscriptionId + '/providers/Microsoft.Sql/servers';
    var config = generateAzureApiConfig(path, API_VERSION_SQL_SERVERS);
    var appliedRgFilters = parseFilterInput(resourceGroupFilterInput);
    var appliedServerFilters = parseFilterInput(sqlServerFilterInput);

    azureCloudManagementService.http.get(config, function(error, response, body) {
        if (error || (response && response.statusCode !== 200)) {
            checkHTTPError(error, response, "Listing SQL Servers");
            deferred.reject(error || (response ? response.body : "Failed to list SQL servers"));
            return;
        }
        try {
            var result = JSON.parse(body);
            var servers = result.value || [];

            if (appliedRgFilters.length > 0) {
                servers = servers.filter(function(server) {
                    var serverRg = server.id.split('/resourceGroups/')[1].split('/')[0].toLowerCase();
                    return appliedRgFilters.indexOf(serverRg) !== -1;
                });
            }

            if (appliedServerFilters.length > 0) {
                servers = servers.filter(function(server) {
                    return appliedServerFilters.indexOf(server.name.toLowerCase()) !== -1;
                });
            }

            deferred.resolve(servers.map(function(server) {
                return {
                    id: server.id,
                    name: server.name,
                    location: server.location,
                    resourceGroupName: server.id.split('/resourceGroups/')[1].split('/')[0]
                };
            }));
        } catch (parseError) {
            console.error("Error parsing SQL server list response: " + parseError, body);
            deferred.reject(parseError);
        }
    });
    return deferred.promise;
}

/**
 * Retrieves all SQL databases for a given SQL server, excluding known system databases.
 */
function listDatabasesForServer(server) {
    var deferred = D.q.defer();
    var path = server.id + '/databases';
    var config = generateAzureApiConfig(path, API_VERSION_SQL_DATABASES);
    var systemDbNamesToExclude = ["master", "model", "msdb", "tempdb"]; // Add any other system DBs if needed

    azureCloudManagementService.http.get(config, function(error, response, body) {
        if (error || (response && response.statusCode !== 200)) {
            if (response && response.statusCode === 404) {
                console.warn("No databases found or accessible for server " + server.name + " (404). URI: " + (response.request ? response.request.uri.href : "N/A"));
                deferred.resolve([]);
                return;
            }
            checkHTTPError(error, response, "Listing Databases for Server " + server.name);
            deferred.reject(error || (response ? response.body : "Failed to list databases for " + server.name));
            return;
        }
        try {
            var result = JSON.parse(body);
            var databases = (result.value || [])
                .filter(function(db) { // Filter out system databases
                    return systemDbNamesToExclude.indexOf(db.name.toLowerCase()) === -1;
                })
                .map(function(db) {
                    return {
                        id: db.id,
                        name: db.name,
                        serverName: server.name,
                        resourceGroupName: server.resourceGroupName,
                        location: db.location || server.location,
                        status: db.properties && db.properties.status ? db.properties.status : 'N/A',
                        sku: db.sku || { name: 'N/A', tier: 'N/A' },
                        pricingTierDisplay: db.sku ? (db.sku.name + " (" + db.sku.tier + ")") : 'N/A'
                    };
                });
            deferred.resolve(databases);
        } catch (parseError) {
            console.error("Error parsing database list for server " + server.name + ": " + parseError, body);
            deferred.reject(parseError);
        }
    });
    return deferred.promise;
}


/**
 * Retrieves specified metrics for a single SQL database.
 * Adjusts CPU/DTU metrics based on the database's SKU tier.
 */
function getDatabaseMetrics(database) {
    var deferred = D.q.defer();
    var finalMetricsToRequest = []; // This will hold the metric objects to actually request
    var skuTier = database.sku && database.sku.tier ? database.sku.tier.toLowerCase() : 'unknown';

    // Determine if the database is likely a DTU model based on its SKU tier
    var isDefinitelyDTU = (skuTier === 'basic' || skuTier === 'standard' || skuTier === 'premium');

    // Filter the global sqlDatabaseMetricsList based on the determined model
    sqlDatabaseMetricsList.forEach(function(metric) {
        if (isDefinitelyDTU) {
            // For DTU models, request dtu_consumption_percent and skip cpu_percent
            if (metric.key !== 'cpu_percent') {
                finalMetricsToRequest.push(metric);
            }
        } else {
            // For vCore models (or if model is unclear/unknown from SKU),
            // request cpu_percent and skip dtu_consumption_percent.
            // This aligns with API errors suggesting cpu_percent is more broadly valid.
            if (metric.key !== 'dtu_consumption_percent') {
                finalMetricsToRequest.push(metric);
            }
        }
    });
    
    // If all metrics were filtered out (e.g., sqlDatabaseMetricsList only had cpu_percent and dtu_consumption_percent, and both got filtered)
    // or if finalMetricsToRequest is empty for some other reason, return N/A for all columns.
    if (finalMetricsToRequest.length === 0 && sqlDatabaseMetricsList.length > 0) {
        var emptyMetricsAllColumns = {};
        sqlDatabaseMetricsList.forEach(function(metricDef) {
            emptyMetricsAllColumns[metricDef.key] = 'N/A';
        });
        console.warn("No metrics to query for DB " + database.name + " after SKU-based filtering. SKU Tier: " + skuTier + ". Returning N/A for all columns.");
        deferred.resolve(emptyMetricsAllColumns);
        return deferred.promise;
    }
    
    var metricKeys = finalMetricsToRequest.map(function(m) { return m.key; }).join(',');
    var aggregations = finalMetricsToRequest.map(function(m) { return m.aggregation; }).join(',');
    var path;

    // If metricKeys is an empty string (e.g., finalMetricsToRequest was empty initially or became empty after filtering)
    // This check is important because an empty metricnames parameter is invalid.
    if (!metricKeys) { 
        var emptyMetricsOnInit = {};
        sqlDatabaseMetricsList.forEach(function(metricDef) { 
            emptyMetricsOnInit[metricDef.key] = 'N/A';
        });
        console.warn("metricKeys string is empty for DB " + database.name + " (SKU Tier: " + skuTier + "). No metrics will be fetched. Returning N/A for all columns.");
        deferred.resolve(emptyMetricsOnInit);
        return deferred.promise;
    }
    
    path = database.id + '/providers/Microsoft.Insights/metrics?metricnames=' + metricKeys + '&timespan=PT5M&interval=PT1M&aggregation=' + aggregations;
    var config = generateAzureApiConfig(path, API_VERSION_MONITOR_METRICS);

    azureCloudManagementService.http.get(config, function(error, response, body) {
        // Initialize metricsData with N/A for ALL columns defined in the original sqlDatabaseMetricsList
        // This ensures the table structure remains consistent even if some metrics are not applicable or fetched.
        var metricsData = {};
        sqlDatabaseMetricsList.forEach(function(metricInfo) {
            metricsData[metricInfo.key] = 'N/A'; 
        });

        if (error || (response && response.statusCode !== 200)) {
            checkHTTPError(error, response, "Fetching metrics for DB " + database.serverName + "/" + database.name);
            deferred.resolve(metricsData); // Resolve with N/A for all metrics for this specific DB
            return;
        }
        try {
            var result = JSON.parse(body);
            // Populate metricsData with values from the response
            // result.value will contain metrics corresponding to 'finalMetricsToRequest'
            (result.value || []).forEach(function(metricResultItem) {
                var metricKeyFromResponse = metricResultItem.name.value.toLowerCase();
                
                // Find the original metric definition from sqlDatabaseMetricsList
                // to get the correct aggregation type and ensure we're populating a valid key.
                var originalMetricDef = sqlDatabaseMetricsList.find(function(mdef) { 
                    return mdef.key.toLowerCase() === metricKeyFromResponse;
                });

                if (originalMetricDef) { 
                    var value = 'N/A';
                    if (metricResultItem.timeseries && metricResultItem.timeseries.length > 0 &&
                        metricResultItem.timeseries[0].data && metricResultItem.timeseries[0].data.length > 0) {
                        var lastDataPoint = metricResultItem.timeseries[0].data[metricResultItem.timeseries[0].data.length - 1];
                        // Use the aggregation defined in our originalMetricDef, which corresponds to what we asked for
                        var aggType = originalMetricDef.aggregation.toLowerCase(); 

                        if (lastDataPoint.hasOwnProperty(aggType)) {
                            value = lastDataPoint[aggType];
                        } else {
                            // Fallback if the specific aggregation type is not in the data point (should be rare if API honored request)
                            var keys = Object.keys(lastDataPoint);
                            var dataKey = keys.find(function(k) { return k !== 'timeStamp'; });
                            if (dataKey) {
                                value = lastDataPoint[dataKey];
                                console.warn("Metric " + originalMetricDef.key + " for " + database.name + ": Requested aggregation '" + aggType + "' not found in response data point. Used fallback value from key '" + dataKey + "'.");
                            }
                        }
                    }
                    metricsData[originalMetricDef.key] = (value === null || typeof value === 'undefined') ? 'N/A' : value;
                } else {
                    console.warn("Received metric from API not in original sqlDatabaseMetricsList: " + metricKeyFromResponse + " for DB " + database.name);
                }
            });
            deferred.resolve(metricsData);
        } catch (parseError) {
            console.error("Error parsing metrics for DB " + database.serverName + "/" + database.name + ": " + parseError, body);
            deferred.resolve(metricsData); // Resolve with N/A initialized data on parse error
        }
    });
    return deferred.promise;
}


/**
 * Creates the Domotz table structure for displaying Azure SQL DB metrics.
 */
function createAzureSqlDbTableDefinition() {
    azureSqlDbTable = D.createTable('Azure SQL Databases', sqlDatabaseTableColumns);
}

/**
 * Formats a metric value.
 */
function formatMetricValue(value) {
    if (value === null || typeof value === 'undefined' || String(value).toLowerCase() === 'n/a' || String(value).trim() === "") {
        return 'N/A';
    }
    var num = parseFloat(value);
    if (isNaN(num)) {
        return 'N/A';
    }
    return Number.isInteger(num) ? num : num.toFixed(2);
}

/**
 * Sanitizes a string to be used as a Domotz record ID.
 */
function sanitizeRecordId(inputId) {
    return inputId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
}

/**
 * Inserts a data record into the Domotz table.
 */
function insertDatabaseRecordIntoTable(database, metrics) {
    var recordId = sanitizeRecordId(database.serverName + "-" + database.name);
    var values = [
        database.name,
        database.serverName,
        database.resourceGroupName,
        database.location,
        database.status,
        database.sku.name,
        database.sku.tier,
        database.pricingTierDisplay
    ];

    sqlDatabaseMetricsList.forEach(function(metricInfo) {
        var value = metrics[metricInfo.key];
        if (metricInfo.callback && typeof metricInfo.callback === 'function') {
            value = metricInfo.callback(value);
        }
        values.push(formatMetricValue(value));
    });

    azureSqlDbTable.insertRecord(recordId, values);
}

//----------------------------------------------------------------------------------------------------//
//                                     DOMOTZ PROCEDURES                                              //
//----------------------------------------------------------------------------------------------------//

/**
 * @remote_procedure
 * @label Validate Azure Credentials and API Access
 * @documentation This procedure attempts to log in to Azure, list SQL servers, and list databases for the first server found to validate credentials and permissions.
 */
function validate() {
    loginToAzure()
        .then(function(loginResult) {
            return listSqlServers();
        })
        .then(function(servers) {
            if (!servers || servers.length === 0) {
                console.warn("Validation: Successfully logged in, but no SQL servers found matching filters or in the subscription.");
                D.success();
                return null; 
            }
            console.log("Validation: Successfully listed " + servers.length + " SQL server(s). Checking databases for the first server: " + servers[0].name);
            return listDatabasesForServer(servers[0]);
        })
        .then(function(databases) {
            if (databases === null) return;
            console.log("Validation: Successfully listed " + databases.length + " database(s) for the first server.");
            D.success();
        })
        .catch(function(error) {
            console.error("Validation failed:", error.message || error);
            // Removed D.isFailure() check. If checkHTTPError or other upstream functions
            // already called D.failure(), this might be a redundant call,
            // but it's safer than using a non-existent method.
            D.failure(D.errorType.GENERIC_ERROR);
        });
}

/**
 * @remote_procedure
 * @label Get Azure SQL Database Metrics
 * @documentation This procedure retrieves Azure SQL databases based on filters and populates a table with their performance metrics.
 */
function get_status() {
    loginToAzure()
        .then(function(loginResult) {
            return listSqlServers();
        })
        .then(function(servers) {
            if (!servers || servers.length === 0) {
                console.log("No SQL servers found matching filters or available in the subscription.");
                createAzureSqlDbTableDefinition();
                D.success(azureSqlDbTable);
                return D.q.resolve([]); 
            }
            var databaseListPromises = servers.map(function(server) {
                return listDatabasesForServer(server);
            });
            return D.q.all(databaseListPromises);
        })
        .then(function(databasesPerServer) {
            var allDatabases = [].concat.apply([], databasesPerServer); // Flatten

            if (allDatabases.length === 0) {
                console.log("No SQL databases found across the listed servers.");
                createAzureSqlDbTableDefinition();
                D.success(azureSqlDbTable);
                return D.q.resolve([]); 
            }
            createAzureSqlDbTableDefinition();

            var metricsPromises = allDatabases.map(function(database) {
                return getDatabaseMetrics(database).then(function(metrics) {
                    return { database: database, metrics: metrics };
                });
            });
            return D.q.all(metricsPromises);
        })
        .then(function(databaseMetricPairs) {
            if (databaseMetricPairs && databaseMetricPairs.length > 0) {
                databaseMetricPairs.forEach(function(pair) {
                    insertDatabaseRecordIntoTable(pair.database, pair.metrics);
                });
                D.success(azureSqlDbTable);
            } else if (databaseMetricPairs) { 
                D.success(azureSqlDbTable); // Success with an empty table if no metrics/data
            }
            // If the chain was stopped by returning D.q.resolve([]), D.success was already called.
        })
        .catch(function(error) {
            console.error("Failed to get Azure SQL DB status:", error.message || error);
            // Removed D.isFailure() check.
            D.failure(D.errorType.GENERIC_ERROR);
        });
}

/**
 * @description Teneant ID
 * @type STRING 
 */
var tenantId = D.getParameter('tenantId');

/**
 * @description Client ID
 * @type STRING 
 */
var clientId = D.getParameter('clientId');

/**
 * @description Client Secret
 * @type SECRET_TEXT 
 */
var clientSecret = D.getParameter('clientSecret');

/**
 * @description Subscription ID
 * @type STRING 
 */
var subscriptionId = D.getParameter('subscriptionId');
