// Database operations
async function readDatabase() {
    try {
        const data = await chrome.storage.local.get(['blockedUrls', 'whitelistedUrls', 'ipDatabase', 'timestamps']);
        const result = {
            blockedUrls: data.blockedUrls || [],
            whitelistedUrls: data.whitelistedUrls || [],
            ipDatabase: data.ipDatabase || {
                blockedIps: {},    // {domain: [ips]}
                whitelistedIps: {} // {domain: [ips]}
            },
            timestamps: data.timestamps || {
                blocked: {},       // {domain: timestamp}
                whitelisted: {},   // {domain: timestamp}
                checked: {}        // {domain: timestamp}
            }
        };
        console.log('Database read:', result);
        return result;
    } catch (error) {
        console.error('Error reading database:', error);
        return { 
            blockedUrls: [], 
            whitelistedUrls: [],
            ipDatabase: {
                blockedIps: {},
                whitelistedIps: {}
            },
            timestamps: {
                blocked: {},
                whitelisted: {},
                checked: {}
            }
        };
    }
}

async function writeDatabase(data) {
    try {
        // Ensure all required properties exist
        const sanitizedData = {
            blockedUrls: data.blockedUrls || [],
            whitelistedUrls: data.whitelistedUrls || [],
            ipDatabase: data.ipDatabase || {
                blockedIps: {},
                whitelistedIps: {}
            },
            timestamps: data.timestamps || {
                blocked: {},
                whitelisted: {},
                checked: {}
            }
        };

        await chrome.storage.local.set(sanitizedData);
        console.log('Database written successfully:', sanitizedData);
        await notifyDatabaseUpdate();
        return true;
    } catch (error) {
        console.error('Error writing database:', error);
        return false;
    }
}

async function addToWhitelist(domain) {
    try {
        const db = await readDatabase();
        if (!db.whitelistedUrls.includes(domain)) {
            // Add to whitelist
            db.whitelistedUrls.push(domain);
            db.timestamps.whitelisted[domain] = Date.now();

            // Initialize ipDatabase if it doesn't exist
            db.ipDatabase = db.ipDatabase || {
                blockedIps: {},
                whitelistedIps: {}
            };

            // Resolve and store IPs
            const ips = await resolveIp(domain);
            console.log(`Resolved IPs for ${domain}:`, ips);
            
            if (ips && ips.length > 0) {
                db.ipDatabase.whitelistedIps[domain] = ips;
                console.log(`Stored IPs for whitelisted domain ${domain}:`, ips);
            }

            // Write the updated database
            const writeResult = await writeDatabase(db);
            console.log(`Database write result for ${domain}:`, writeResult);
        }
    } catch (error) {
        console.error('Error adding to whitelist:', error);
    }
}

async function addToBlocklist(domain) {
    try {
        const db = await readDatabase();
        if (!db.blockedUrls.includes(domain)) {
            // Add to blocklist
            db.blockedUrls.push(domain);
            db.timestamps.blocked[domain] = Date.now();

            // Initialize ipDatabase if it doesn't exist
            db.ipDatabase = db.ipDatabase || {
                blockedIps: {},
                whitelistedIps: {}
            };

            // Resolve and store IPs
            const ips = await resolveIp(domain);
            console.log(`Resolved IPs for ${domain}:`, ips);
            
            if (ips && ips.length > 0) {
                db.ipDatabase.blockedIps[domain] = ips;
                console.log(`Stored IPs for blocked domain ${domain}:`, ips);
            }

            // Write the updated database
            const writeResult = await writeDatabase(db);
            console.log(`Database write result for ${domain}:`, writeResult);
        }
    } catch (error) {
        console.error('Error adding to blocklist:', error);
    }
}

async function removeFromBlocklist(domain) {
    const db = await readDatabase();
    const index = db.blockedUrls.indexOf(domain);
    if (index > -1) {
        db.blockedUrls.splice(index, 1);
        await writeDatabase(db);
        console.log('Removed from blocklist:', domain);
    }
}

async function removeFromWhitelist(domain) {
    const db = await readDatabase();
    const index = db.whitelistedUrls.indexOf(domain);
    if (index > -1) {
        db.whitelistedUrls.splice(index, 1);
        await writeDatabase(db);
        console.log('Removed from whitelist:', domain);
    }
}

// Add this after each database write operation
async function notifyDatabaseUpdate() {
    const db = await readDatabase();
    chrome.runtime.sendMessage({ type: 'databaseUpdated', data: db });
}

// Add IP resolution function
async function resolveIp(domain) {
    try {
        console.log(`Resolving IP for domain: ${domain}`);
        const response = await fetch(`https://dns.google/resolve?name=${domain}`);
        const data = await response.json();
        console.log(`DNS resolution response for ${domain}:`, data);

        if (data.Answer && data.Answer.length > 0) {
            // Get all unique IPs
            const ips = data.Answer
                .filter(record => record.type === 1) // Type 1 is A record (IPv4)
                .map(record => record.data);
            const uniqueIps = [...new Set(ips)]; // Remove duplicates
            console.log(`Resolved unique IPs for ${domain}:`, uniqueIps);
            return uniqueIps;
        }
        console.log(`No IP addresses found for ${domain}`);
        return null;
    } catch (error) {
        console.error(`Error resolving IP for ${domain}:`, error);
        return null;
    }
}

// Add IP checking function
async function checkIpStatus(ip) {
    const db = await readDatabase();
    
    // Check blocked IPs
    for (const [domain, ips] of Object.entries(db.ipDatabase.blockedIps)) {
        if (ips.includes(ip)) {
            return {
                blocked: true,
                reason: `IP associated with blocked domain: ${domain}`
            };
        }
    }
    
    // Check whitelisted IPs
    for (const [domain, ips] of Object.entries(db.ipDatabase.whitelistedIps)) {
        if (ips.includes(ip)) {
            return {
                whitelisted: true,
                reason: `IP associated with whitelisted domain: ${domain}`
            };
        }
    }
    
    return {
        blocked: false,
        whitelisted: false
    };
}

// Make functions available globally
this.readDatabase = readDatabase;
this.writeDatabase = writeDatabase;
this.addToWhitelist = addToWhitelist;
this.addToBlocklist = addToBlocklist;
this.removeFromBlocklist = removeFromBlocklist;
this.removeFromWhitelist = removeFromWhitelist;
this.resolveIp = resolveIp;
this.checkIpStatus = checkIpStatus; 

// Initialize database with timestamps
async function initDatabase() {
    const defaultDb = {
        blockedUrls: [],
        whitelistedUrls: [],
        timestamps: {
            blocked: {},    // { domain: timestamp }
            whitelisted: {} // { domain: timestamp }
        }
    };

    try {
        await chrome.storage.local.set({ urlDatabase: defaultDb });
        return defaultDb;
    } catch (error) {
        console.error('Error initializing database:', error);
        return null;
    }
}

// Add cleanup function for 30-day old records
async function cleanupOldRecords() {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const now = Date.now();
    
    try {
        console.log('Starting database cleanup check...');
        const db = await readDatabase();
        let hasChanges = false;

        // Cleanup blocked URLs
        for (const [domain, timestamp] of Object.entries(db.timestamps.blocked)) {
            if (now - timestamp > THIRTY_DAYS) {
                const index = db.blockedUrls.indexOf(domain);
                if (index > -1) {
                    db.blockedUrls.splice(index, 1);
                    delete db.timestamps.blocked[domain];
                    hasChanges = true;
                    console.log(`Removed expired blocked domain: ${domain}`);
                }
            }
        }

        // Cleanup whitelisted URLs
        for (const [domain, timestamp] of Object.entries(db.timestamps.whitelisted)) {
            if (now - timestamp > THIRTY_DAYS) {
                const index = db.whitelistedUrls.indexOf(domain);
                if (index > -1) {
                    db.whitelistedUrls.splice(index, 1);
                    delete db.timestamps.whitelisted[domain];
                    hasChanges = true;
                    console.log(`Removed expired whitelisted domain: ${domain}`);
                }
            }
        }

        // Save changes if necessary
        if (hasChanges) {
            await writeDatabase(db);
            console.log('Database updated: removed expired records');
        }
    } catch (error) {
        console.error('Error during database cleanup:', error);
    }
}

// Setup periodic cleanup (once per day)
async function setupPeriodicCleanup() {
    // Check for cleanup on extension startup
    await cleanupOldRecords();

    // Set up daily cleanup check
    setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);
}

// Call this in the background script
setupPeriodicCleanup(); 