// Function to sync with central database
async function syncWithCentralDatabase() {
    try {
        const db = await readDatabase();
        
        // Get current timestamp
        const now = Date.now();
        const TWO_MINUTES = 2 * 60 * 1000; // 2 minutes in milliseconds

        // Filter for recent changes only
        const recentBlockedUrls = db.blockedUrls.filter(url => {
            const timestamp = db.timestamps?.blocked?.[url] || 0;
            return (now - timestamp) <= TWO_MINUTES;
        });

        const recentWhitelistedUrls = db.whitelistedUrls.filter(url => {
            const timestamp = db.timestamps?.whitelisted?.[url] || 0;
            return (now - timestamp) <= TWO_MINUTES;
        });

        // Only sync if there are recent changes
        if (recentBlockedUrls.length === 0 && recentWhitelistedUrls.length === 0) {
            console.log('No recent changes to sync');
            return;
        }

        // Make sure to use the correct server IP and port
        const serverUrl = 'http://192.168.70.37:3000';
        const credentials = btoa('admin:Salam123');
        
        console.log('Attempting to connect to server:', serverUrl);

        try {
            // Test server connection first
            const testResponse = await fetch(`${serverUrl}/api/status`, {
                headers: {
                    'Authorization': `Basic ${credentials}`
                }
            });
            
            if (!testResponse.ok) {
                throw new Error('Server not responding correctly');
            }
            
            console.log('Server connection successful');
        } catch (error) {
            console.error('Server connection failed:', error.message);
            return;
        }
        
        console.log('Syncing recent changes:', {
            blockedUrls: recentBlockedUrls,
            whitelistedUrls: recentWhitelistedUrls
        });

        const response = await fetch(`${serverUrl}/api/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify({
                database: {
                    blockedUrls: recentBlockedUrls,
                    whitelistedUrls: recentWhitelistedUrls,
                    timestamps: {
                        blocked: Object.fromEntries(
                            recentBlockedUrls.map(url => [url, db.timestamps?.blocked?.[url] || now])
                        ),
                        whitelisted: Object.fromEntries(
                            recentWhitelistedUrls.map(url => [url, db.timestamps?.whitelisted?.[url] || now])
                        )
                    }
                }
            })
        });

        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(`Sync failed: ${responseData.error || response.statusText}`);
        }

        console.log('Sync response:', responseData);
        console.log('Recent changes synced successfully at:', new Date().toISOString());
    } catch (error) {
        console.error('Error syncing with central database:', error.message);
        console.log('Will retry in 2 minutes');
    }
}

// Start periodic sync
function startPeriodicSync() {
    console.log('Starting periodic sync...');
    
    // Initial connection test
    syncWithCentralDatabase().then(() => {
        console.log('Initial sync completed');
    }).catch(error => {
        console.error('Initial sync failed:', error.message);
    });
    
    // Sync every 2 minutes
    setInterval(syncWithCentralDatabase, 1 * 60 * 1000);
}

// Export functions
this.startPeriodicSync = startPeriodicSync;
this.syncWithCentralDatabase = syncWithCentralDatabase; 