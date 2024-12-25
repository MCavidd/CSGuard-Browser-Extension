importScripts('databaseOperations.js');
importScripts('sync.js');

// Add this to check API key status on extension startup
chrome.runtime.onInstalled.addListener(async () => {
    try {
        const result = await chrome.storage.local.get('apiKey');
        if (!result.apiKey) {
            console.log('No API key found. Extension functionality will be limited.');
            showNotification('Please configure your VirusTotal API key in the extension settings.');
        }

        // Initialize database cleanup
        await setupPeriodicCleanup();

        // Start periodic sync with central database
        startPeriodicSync();
    } catch (error) {
        console.error('Error during installation:', error);
    }
});

// Add this error handling for runtime messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Always return true if you're going to send a response asynchronously
    return true;
});

// Modify the notifications code to check if the API exists first
function showNotification(message) {
    if (chrome.notifications) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon1.png',
            title: 'MilliGuard',
            message: message
        });
    } else {
        console.log('Notifications not available:', message);
    }
}

// Add error handling for storage operations
async function safeStorageGet(key) {
    try {
        return await chrome.storage.local.get(key);
    } catch (error) {
        console.error('Storage get error:', error);
        return {};
    }
}

// Add this helper function at the top of background.js
function isValidDomain(domain) {
    if (!domain) return false;
    if (domain === 'null' || domain === 'undefined') return false;
    
    // Check if it's a proper domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
}

// Modify the checkUrl function to include domain validation
async function checkUrl(url) {
    try {
        // First validate the domain
        if (!url || !isValidDomain(url)) {
            console.log('Invalid domain:', url);
            return { malicious: false, error: 'Invalid domain' };
        }

        // First check if we have a recent check for this domain
        const db = await readDatabase();
        const now = Date.now();
        const lastCheck = db.timestamps?.checked?.[url] || 0;
        const TIME_BETWEEN_CHECKS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        
        if (lastCheck) {
            const timeLeft = TIME_BETWEEN_CHECKS - (now - lastCheck);
            if (timeLeft > 0) {
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                console.log(`⏳ Time until recheck for ${url}: ${daysLeft}d ${hoursLeft}h`);
                
                // Return cached result if it exists
                if (db.whitelistedUrls.includes(url)) {
                    console.log('✅ Using cached whitelist status');
                    return { cached: true, whitelisted: true };
                } else if (db.blockedUrls.includes(url)) {
                    console.log('🚫 Using cached blocklist status');
                    return { cached: true, blocked: true };
                }
            } else {
                console.log('⌛ Check period expired, performing new check');
            }
        } else {
            console.log('🆕 First time checking this domain');
        }

        const result = await safeStorageGet('apiKey');
        const apiKey = result.apiKey;

        if (!apiKey) {
            console.log('🔑 No VirusTotal API key found');
            return { malicious: false, error: 'No API key configured' };
        }

        console.log('🔍 Starting check for URL:', url);
        const response = await fetch(`https://www.virustotal.com/api/v3/domains/${url}`, {
            method: 'GET',
            headers: {
                'x-apikey': apiKey
            }
        });
        
        const data = await response.json();
        console.log('📥 VirusTotal Raw Response:', data);
        console.log('🔍 Analysis Stats:', data.data?.attributes?.last_analysis_stats);

        if (!data || !data.data || !data.data.attributes || !data.data.attributes.last_analysis_stats) {
            console.error('❌ Invalid response structure from VirusTotal:', data);
            return { malicious: false, error: 'Invalid API response' };
        }

        // Extract IP addresses from the response
        const ipAddresses = [];
        console.log('🔍 Looking for DNS records...');
        
        if (data.data.attributes.last_dns_records) {
            console.log('📍 DNS records found:', JSON.stringify(data.data.attributes.last_dns_records, null, 2));
            data.data.attributes.last_dns_records.forEach(record => {
                if (record.type === 'A' || record.type === 'AAAA') {
                    ipAddresses.push(record.value);
                    console.log(`✅ Found ${record.type} record:`, record.value);
                }
            });
        } else {
            console.log('❌ No last_dns_records found');
        }

        if (data.data.attributes.last_dns_a_records) {
            console.log('📍 A records found:', JSON.stringify(data.data.attributes.last_dns_a_records, null, 2));
            data.data.attributes.last_dns_a_records.forEach(record => {
                ipAddresses.push(record.value);
                console.log('✅ Found A record:', record.value);
            });
        } else {
            console.log('❌ No last_dns_a_records found');
        }

        if (ipAddresses.length === 0) {
            console.log('⚠️ No IP addresses found. Full response:', JSON.stringify(data.data.attributes, null, 2));
        } else {
            console.log('📍 All extracted IP addresses:', ipAddresses);
        }

        // Check each IP with AbuseIPDB
        const abuseIPDBKey = await safeStorageGet('abuseIPDBKey');
        if (!abuseIPDBKey) {
            console.log('🔑 No AbuseIPDB key found');
            return data;
        }

        console.log('🔍 Starting AbuseIPDB checks for', ipAddresses.length, 'IPs');
        
        for (const ip of ipAddresses) {
            try {
                console.log(`📡 Checking IP ${ip} with AbuseIPDB...`);
                const abuseResponse = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}`, {
                    method: 'GET',
                    headers: {
                        'Key': abuseIPDBKey.abuseIPDBKey,
                        'Accept': 'application/json'
                    }
                });

                const abuseData = await abuseResponse.json();
                console.log(`📥 AbuseIPDB response for ${ip}:`, abuseData);
                
                const isp = abuseData.data?.isp?.toLowerCase() || '';
                console.log(`🏢 ISP for ${ip}:`, isp);

                const knownCloudProviders = [
                    'cloudflare', 'azure', 'microsoft', 'digitalocean',
                    'amazon', 'aws', 'google', 'gcp', 'linode',
                    'vultr', 'ovh', 'heroku'
                ];

                const isCloudProvider = knownCloudProviders.some(provider => 
                    isp.includes(provider.toLowerCase())
                );
                console.log(`☁️ Is cloud provider: ${isCloudProvider}`);

                if (data.data.attributes.last_analysis_stats.malicious > 3 && !isCloudProvider) {
                    await addToBlocklist(ip);
                    console.log(`🚫 Blocked IP ${ip} (Non-cloud provider)`);
                } else {
                    console.log(`✅ IP ${ip} not blocked:`, 
                        isCloudProvider ? 'Is cloud provider' : 'Not malicious enough');
                }
            } catch (error) {
                console.error(`❌ Error checking IP ${ip} with AbuseIPDB:`, error);
            }
        }

        // After successful check, update the timestamp
        db.timestamps = db.timestamps || {};
        db.timestamps.checked = db.timestamps.checked || {};
        db.timestamps.checked[url] = now;
        await writeDatabase(db);

        return data;
    } catch (error) {
        console.error('❌ Error in checkUrl:', error);
        return { malicious: false, error: error.message };
    }
}

// Modify the webNavigation listener to include domain validation
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    try {
        console.log('Navigation detected:', details);
        
        if (!details || !details.url) {
            console.log('Invalid navigation details');
            return;
        }

        // Check if the extension is enabled
        const { isEnabled } = await chrome.storage.local.get('isEnabled');
        console.log('Extension enabled status:', isEnabled);
        
        if (isEnabled === false) {
            console.log('Extension is disabled, allowing navigation');
            return;
        }

        const url = new URL(details.url);
        const domain = url.hostname;

        // Validate domain before processing
        if (!isValidDomain(domain)) {
            console.log('Skipping invalid domain:', domain);
            return;
        }

        console.log('Checking domain:', domain);

        // Skip checking for ignored domains
        if (shouldIgnoreDomain(domain)) {
            console.log('Ignoring internal/special domain:', domain);
            return;
        }

        // Read from database
        const db = await readDatabase();
        
        // Check whitelist first
        if (db.whitelistedUrls.includes(domain)) {
            console.log('Domain is whitelisted, allowing access:', domain);
            return;
        }

        // Check blocklist
        if (db.blockedUrls.includes(domain)) {
            const lastCheck = db.timestamps?.checked?.[domain] || 0;
            const now = Date.now();
            const TIME_BETWEEN_CHECKS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            const timeLeft = TIME_BETWEEN_CHECKS - (now - lastCheck);
            
            let timeMessage = '';
            if (timeLeft > 0) {
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                timeMessage = ` (Next check in ${daysLeft}d ${hoursLeft}h)`;
            } else {
                timeMessage = ' (Check period expired)';
            }
            
            console.log('Domain found in blocklist, blocking access:', domain + timeMessage);
            chrome.tabs.update(details.tabId, { 
                url: `blocked.html?domain=${encodeURIComponent(domain)}&originalUrl=${encodeURIComponent(details.url)}` 
            });
            return;
        }

        // If not in either list, check with VirusTotal
        console.log('Checking with VirusTotal:', domain);
        try {
            const virusTotalResult = await checkUrl(domain);
            console.log('VirusTotal check result:', virusTotalResult);
            
            if (virusTotalResult.data?.attributes?.last_analysis_stats?.malicious > 3) {
                console.log('Malicious site detected by VirusTotal:', domain);
                await addToBlocklist(domain);
                chrome.tabs.update(details.tabId, { 
                    url: `blocked.html?domain=${encodeURIComponent(domain)}&originalUrl=${encodeURIComponent(details.url)}` 
                });
            } else {
                console.log('Domain is safe, adding to whitelist:', domain);
                await addToWhitelist(domain);
            }
        } catch (error) {
            console.error('Error checking URL with VirusTotal:', error);
        }
    } catch (error) {
        console.error('Error in navigation listener:', error);
    }
});

function shouldIgnoreDomain(domain) {
    const ignoredDomains = [
        'newtab',
        'chrome',
        'localhost',
        'chrome-extension',
        'devtools',
        'about',
        'extensions'
    ];
    
    // Only ignore if the domain exactly matches or starts with these special protocols
    return ignoredDomains.some(ignored => 
        domain === ignored || 
        domain.startsWith(`${ignored}.`) ||
        domain.startsWith(`${ignored}://`)
    );
}




