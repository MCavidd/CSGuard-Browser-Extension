const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const { writeFile, copyFile } = require('fs').promises;

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Authentication middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }

    // Get credentials from Authorization header
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    // Check credentials against environment variables
    if (username === process.env.API_USERNAME && 
        password === process.env.API_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
}

// Apply authentication to all routes
app.use(authenticate);

// Path to the central database file
const DB_PATH = path.join(__dirname, 'databaseAll.json');

// Initialize database if it doesn't exist
async function initializeDatabase() {
    try {
        await fs.access(DB_PATH);
        console.log('Database file exists');
    } catch {
        console.log('Creating new database file');
        // File doesn't exist, create it with initial structure
        await fs.writeFile(DB_PATH, JSON.stringify({
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
        }, null, 2));
    }
}

// Add this function after initializeDatabase
async function validateAndRepairDatabase() {
    try {
        console.log('Validating database file...');
        const rawData = await fs.readFile(DB_PATH, 'utf8');
        
        try {
            // Try to parse the existing data
            JSON.parse(rawData);
            console.log('Database file is valid JSON');
            return true;
        } catch (parseError) {
            console.error('Database file is corrupted, creating new one...');
            
            // Create new database with default structure
            const defaultDb = {
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

            // Write the new database
            await fs.writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2));
            console.log('Created new database file');
            return true;
        }
    } catch (error) {
        console.error('Error validating database:', error);
        return false;
    }
}

// Function to read database
async function readDatabase() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        try {
            return JSON.parse(data);
        } catch (parseError) {
            console.error('Error parsing database, attempting repair...');
            await validateAndRepairDatabase();
            const newData = await fs.readFile(DB_PATH, 'utf8');
            return JSON.parse(newData);
        }
    } catch (error) {
        console.error('Error reading database:', error);
        throw error;
    }
}

// Function to write database
async function writeDatabase(data) {
    try {
        // Create backup before writing
        await backupDatabase();
        
        // Validate data structure
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data structure');
        }

        // Ensure all required properties exist
        const validatedData = {
            blockedUrls: Array.isArray(data.blockedUrls) ? data.blockedUrls : [],
            whitelistedUrls: Array.isArray(data.whitelistedUrls) ? data.whitelistedUrls : [],
            ipDatabase: {
                blockedIps: data.ipDatabase?.blockedIps || {},
                whitelistedIps: data.ipDatabase?.whitelistedIps || {}
            },
            timestamps: {
                blocked: data.timestamps?.blocked || {},
                whitelisted: data.timestamps?.whitelisted || {},
                checked: data.timestamps?.checked || {}
            }
        };

        const jsonString = JSON.stringify(validatedData, null, 2);
        await fs.writeFile(DB_PATH, jsonString);
        console.log('Database written successfully. Size:', jsonString.length, 'bytes');
        
        // Verify the write
        const verification = await fs.readFile(DB_PATH, 'utf8');
        if (verification === jsonString) {
            console.log('Database write verified successfully');
        } else {
            console.error('Database write verification failed');
        }
    } catch (error) {
        console.error('Error writing database:', error);
        throw error;
    }
}

// Add this function after validateAndRepairDatabase
async function backupDatabase() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${DB_PATH}.${timestamp}.backup`;
        await copyFile(DB_PATH, backupPath);
        console.log(`Database backed up to ${backupPath}`);
    } catch (error) {
        console.error('Error creating backup:', error);
    }
}

// Update the sync endpoint to include timestamps
app.post('/api/sync', async (req, res) => {
    try {
        const { database } = req.body;
        
        console.log('\n=== Sync Request ===');
        console.log('Time:', new Date().toISOString());

        if (!database) {
            console.error('No database in request body');
            return res.status(400).json({ 
                error: 'Missing database in request' 
            });
        }

        // Read current database
        const centralDb = await readDatabase();
        
        // Get current timestamp
        const now = Date.now();
        const TWO_MINUTES = 2 * 60 * 1000; // 2 minutes in milliseconds

        // Only process URLs that were added/modified in the last 2 minutes
        const recentBlockedUrls = database.blockedUrls?.filter(url => {
            const timestamp = database.timestamps?.blocked?.[url] || 0;
            return (now - timestamp) <= TWO_MINUTES;
        }) || [];

        const recentWhitelistedUrls = database.whitelistedUrls?.filter(url => {
            const timestamp = database.timestamps?.whitelisted?.[url] || 0;
            return (now - timestamp) <= TWO_MINUTES;
        }) || [];

        console.log('Processing URLs from last 2 minutes:');
        console.log('Blocked:', recentBlockedUrls);
        console.log('Whitelisted:', recentWhitelistedUrls);

        let changesCount = 0;

        // Append new URLs (avoid duplicates)
        recentBlockedUrls.forEach(url => {
            if (!centralDb.blockedUrls.includes(url)) {
                console.log('Adding new blocked URL:', url);
                centralDb.blockedUrls.push(url);
                changesCount++;
            }
        });

        recentWhitelistedUrls.forEach(url => {
            if (!centralDb.whitelistedUrls.includes(url)) {
                console.log('Adding new whitelisted URL:', url);
                centralDb.whitelistedUrls.push(url);
                changesCount++;
            }
        });

        // Only update timestamps for recent changes
        if (database.timestamps) {
            recentBlockedUrls.forEach(url => {
                centralDb.timestamps.blocked[url] = database.timestamps.blocked[url];
            });
            recentWhitelistedUrls.forEach(url => {
                centralDb.timestamps.whitelisted[url] = database.timestamps.whitelisted[url];
            });
        }

        // Save updated database if there were changes
        if (changesCount > 0) {
            await writeDatabase(centralDb);
            console.log(`Database updated with ${changesCount} changes`);
        } else {
            console.log('No recent changes to sync');
        }
        
        res.status(200).json({ 
            message: 'Database synced successfully',
            timestamp: new Date(),
            changesCount,
            currentSize: {
                blockedUrls: centralDb.blockedUrls.length,
                whitelistedUrls: centralDb.whitelistedUrls.length
            }
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ 
            error: 'Failed to sync database',
            details: error.message 
        });
    }
});

// Add a status endpoint
app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: 'running',
        timestamp: new Date()
    });
});

// Add this new endpoint
app.get('/api/database/status', async (req, res) => {
    try {
        const db = await readDatabase();
        res.status(200).json({
            blockedUrlsCount: db.blockedUrls.length,
            whitelistedUrlsCount: db.whitelistedUrls.length,
            lastModified: (await fs.stat(DB_PATH)).mtime
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add this new endpoint to your server.js
app.get('/api/database/view', async (req, res) => {
    try {
        const db = await readDatabase();
        res.status(200).json({
            totalBlockedUrls: db.blockedUrls.length,
            totalWhitelistedUrls: db.whitelistedUrls.length,
            blockedUrls: db.blockedUrls,
            whitelistedUrls: db.whitelistedUrls,
            lastModified: (await fs.stat(DB_PATH)).mtime
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;

initializeDatabase()
    .then(async () => {
        // Validate database after initialization
        await validateAndRepairDatabase();
        
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Database path: ${DB_PATH}`);
        });
    })
    .catch(error => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down...');
    process.exit(0);
});

// Add this after server initialization
// Create backup every 6 hours
setInterval(backupDatabase, 6 * 60 * 60 * 1000); 