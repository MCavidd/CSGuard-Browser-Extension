// Function to update the toggle button's text based on the extension state
function updateToggleButtonState(isEnabled) {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('statusText');
    
    if (isEnabled) {
        // Enabled state
        toggleButton.textContent = 'Enabled';
        toggleButton.style.backgroundColor = '#03dac6'; // Green for enabled state
        toggleButton.classList.remove('disabled');
        statusText.textContent = 'Protection is currently active';
        statusText.classList.remove('disabled');
        statusText.classList.add('enabled');
    } else {
        // Disabled state
        toggleButton.textContent = 'Disabled';
        toggleButton.style.backgroundColor = '#ff4757'; // Red for disabled state
        toggleButton.classList.add('disabled');
        statusText.textContent = 'Protection is currently inactive';
        statusText.classList.remove('enabled');
        statusText.classList.add('disabled');
    }
}

// Add event listener for the enable/disable extension toggle button
document.addEventListener('DOMContentLoaded', async () => {
    const toggleButton = document.getElementById('toggleButton');
    
    // Load and set the current state
    chrome.storage.local.get('isEnabled', (result) => {
        // Default to enabled if not set
        const isEnabled = result.isEnabled === undefined ? true : result.isEnabled;
        updateToggleButtonState(isEnabled);
        // Make sure to set the initial state in storage
        chrome.storage.local.set({ isEnabled: isEnabled });
    });

    // Add click handler for the toggle button
    toggleButton.addEventListener('click', async () => {
        // Get current state and toggle it
        const { isEnabled } = await chrome.storage.local.get('isEnabled');
        const newState = !isEnabled;
        
        // Save the new state
        await chrome.storage.local.set({ isEnabled: newState });
        
        // Update the UI
        updateToggleButtonState(newState);
        
        // Log the state change
        console.log('Extension enabled state changed to:', newState);
        
        // Refresh current tab to apply changes immediately
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
            chrome.tabs.reload(activeTab.id);
        }
    });

    // Hover effects
    toggleButton.addEventListener('mouseover', function() {
        const isEnabled = !this.classList.contains('disabled');
        this.style.backgroundColor = isEnabled ? '#02b9a8' : '#ff6b81';
    });

    toggleButton.addEventListener('mouseout', function() {
        const isEnabled = !this.classList.contains('disabled');
        this.style.backgroundColor = isEnabled ? '#03dac6' : '#ff4757';
    });
});

// Function to update the displayed lists with remove buttons
async function updateListDisplay() {
    const db = await readDatabase();
    
    // Update blocked list
    const blockedList = document.getElementById('blockedList');
    blockedList.innerHTML = db.blockedUrls.length ? 
        db.blockedUrls.map(url => {
            const ips = db.ipDatabase.blockedIps[url] || [];
            return `
                <div class="url-item">
                    <div>
                        <div>${url}</div>
                        <div class="ip-info">${ips.join(', ') || 'No IP info'}</div>
                    </div>
                    <button class="remove-button" data-url="${url}" data-list="blocked">Remove</button>
                </div>
            `;
        }).join('') :
        '<div class="url-item">No blocked websites</div>';

    // Update whitelist
    const whiteList = document.getElementById('whiteList');
    whiteList.innerHTML = db.whitelistedUrls.length ?
        db.whitelistedUrls.map(url => `
            <div class="url-item">
                ${url}
                <button class="remove-button" data-url="${url}" data-list="white">Remove</button>
            </div>
        `).join('') :
        '<div class="url-item">No whitelisted websites</div>';

    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-button').forEach(button => {
        button.addEventListener('click', async (e) => {
            const url = e.target.dataset.url;
            const listType = e.target.dataset.list;
            
            if (listType === 'blocked') {
                await removeFromBlocklist(url);
            } else if (listType === 'white') {
                await removeFromWhitelist(url);
            }
            
            await updateListDisplay();
        });
    });
}

// Add functions to remove from lists
async function removeFromBlocklist(domain) {
    const db = await readDatabase();
    const index = db.blockedUrls.indexOf(domain);
    if (index > -1) {
        db.blockedUrls.splice(index, 1);
        await writeDatabase(db);
        await updateListDisplay();
    }
}

async function removeFromWhitelist(domain) {
    const db = await readDatabase();
    const index = db.whitelistedUrls.indexOf(domain);
    if (index > -1) {
        db.whitelistedUrls.splice(index, 1);
        await writeDatabase(db);
        await updateListDisplay();
    }
}

// Update the export functionality
document.getElementById('exportButton').addEventListener('click', async () => {
    const db = await readDatabase();
    
    // Create CSV content with headers
    let csvContent = 'Category,Domain,IP Addresses,Date Added,Last Check,Status\n';
    
    // Add blocked domains
    db.blockedUrls.forEach(domain => {
        const ips = db.ipDatabase?.blockedIps?.[domain] || [];
        const dateAdded = new Date(db.timestamps?.blocked?.[domain] || Date.now()).toLocaleDateString();
        const lastCheck = new Date(db.timestamps?.checked?.[domain] || Date.now()).toLocaleDateString();
        csvContent += `Blocked,${domain},"${ips.join('; ')}",${dateAdded},${lastCheck},Active\n`;
    });
    
    // Add whitelisted domains
    db.whitelistedUrls.forEach(domain => {
        const ips = db.ipDatabase?.whitelistedIps?.[domain] || [];
        const dateAdded = new Date(db.timestamps?.whitelisted?.[domain] || Date.now()).toLocaleDateString();
        const lastCheck = new Date(db.timestamps?.checked?.[domain] || Date.now()).toLocaleDateString();
        csvContent += `Whitelisted,${domain},"${ips.join('; ')}",${dateAdded},${lastCheck},Active\n`;
    });
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    link.setAttribute('href', url);
    link.setAttribute('download', `CSGuard_Database_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// Load saved states when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    // Set default state to enabled
    chrome.storage.local.get('isEnabled', (result) => {
        const isEnabled = result.isEnabled === undefined ? true : result.isEnabled;
        updateToggleButtonState(isEnabled);
        chrome.storage.local.set({ isEnabled: isEnabled });
    });

    // Load dark mode preference
    chrome.storage.local.get('darkMode', (result) => {
        const isDarkMode = result.darkMode === undefined ? true : result.darkMode;
        document.getElementById('darkModeToggle').checked = isDarkMode;
        if (!isDarkMode) {
            document.body.classList.add('light-mode');
        }
    });

    // Update the lists display
    await updateListDisplay();

    // Load saved API keys
    chrome.storage.local.get(['apiKey', 'abuseIPDBKey'], (result) => {
        // Handle VirusTotal API key
        const apiKey = result.apiKey || '';
        const apiKeyInput = document.getElementById('apiKeyInput');
        const apiStatus = document.getElementById('apiStatus');
        
        if (apiKey) {
            apiKeyInput.value = '••••' + apiKey.slice(-4);
            apiStatus.textContent = 'API Key is set';
            apiStatus.style.color = '#03dac6';
        } else {
            apiStatus.textContent = 'Please enter your VirusTotal API key';
            apiStatus.style.color = '#ff4757';
        }

        // Handle AbuseIPDB API key
        const abuseIPDBKey = result.abuseIPDBKey || '';
        const abuseIPDBKeyInput = document.getElementById('abuseIPDBKeyInput');
        const abuseIPDBStatus = document.getElementById('abuseIPDBStatus');

        if (abuseIPDBKey) {
            abuseIPDBKeyInput.value = '••••' + abuseIPDBKey.slice(-4);
            abuseIPDBStatus.textContent = 'AbuseIPDB Key is set';
            abuseIPDBStatus.style.color = '#03dac6';
        } else {
            abuseIPDBStatus.textContent = 'Please enter your AbuseIPDB API key';
            abuseIPDBStatus.style.color = '#ff4757';
        }
    });

    // Help button functionality
    const helpButton = document.getElementById('helpButton');
    const helpTexts = document.querySelectorAll('.help-text');
    let helpVisible = false;

    helpButton.addEventListener('click', () => {
        helpVisible = !helpVisible;
        helpTexts.forEach(text => {
            if (helpVisible) {
                text.classList.add('show');
            } else {
                text.classList.remove('show');
            }
        });
        
        // Update button appearance
        helpButton.style.background = helpVisible ? '#9965f4' : '#bb86fc';
        helpButton.title = helpVisible ? 'Hide Help' : 'Show Help';
    });

    // Add hover effect colors
    const toggleButton = document.getElementById('toggleButton');
    
    toggleButton.addEventListener('mouseover', function() {
        const isEnabled = !this.classList.contains('disabled');
        this.style.backgroundColor = isEnabled ? '#02b9a8' : '#ff6b81'; // Darker shades for hover
    });

    toggleButton.addEventListener('mouseout', function() {
        const isEnabled = !this.classList.contains('disabled');
        this.style.backgroundColor = isEnabled ? '#03dac6' : '#ff4757'; // Return to original colors
    });
});

// Add this to your existing popup.js
document.getElementById('darkModeToggle').addEventListener('change', (e) => {
    const isDarkMode = e.target.checked;
    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
    chrome.storage.local.set({ darkMode: isDarkMode });
});

// Listen for database changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local' && (changes.blockedUrls || changes.whitelistedUrls)) {
        await updateListDisplay();
    }
});

// Add this helper function at the top of popup.js
function extractDomain(input) {
    try {
        // Check if input is a URL or domain
        let domain = input.trim().toLowerCase();
        
        // Remove any protocol and www if present
        if (domain.includes('://')) {
            const url = new URL(domain);
            domain = url.hostname;
        } else if (domain.startsWith('www.')) {
            domain = domain.slice(4);
        }
        
        // Handle cases where user might paste a full path
        if (domain.includes('/')) {
            domain = domain.split('/')[0];
        }
        
        // Remove any remaining www.
        domain = domain.replace(/^www\./i, '');
        
        console.log('Extracted domain:', domain, 'from input:', input);
        return domain;
    } catch (error) {
        console.error('Error extracting domain:', error);
        return input.trim().toLowerCase();
    }
}

// Update the blacklist button event listener
document.getElementById('addBlacklistButton').addEventListener('click', async () => {
    const input = document.getElementById('blacklistInput');
    const rawInput = input.value.trim();
    
    if (rawInput) {
        const domain = extractDomain(rawInput);
        await addToBlocklist(domain);
        input.value = ''; // Clear the input field
        await updateListDisplay();
        
        // Show feedback if the domain was different from input
        if (domain !== rawInput) {
            const apiStatus = document.getElementById('apiStatus');
            apiStatus.textContent = `Added domain: ${domain}`;
            apiStatus.style.color = '#03dac6';
            setTimeout(() => {
                apiStatus.textContent = '';
            }, 3000);
        }
    }
});

// Update the whitelist button event listener
document.getElementById('addWhitelistButton').addEventListener('click', async () => {
    const input = document.getElementById('whitelistInput');
    const rawInput = input.value.trim();
    
    if (rawInput) {
        const domain = extractDomain(rawInput);
        await addToWhitelist(domain);
        input.value = ''; // Clear the input field
        await updateListDisplay();
        
        // Show feedback if the domain was different from input
        if (domain !== rawInput) {
            const abuseIPDBStatus = document.getElementById('abuseIPDBStatus');
            abuseIPDBStatus.textContent = `Added domain: ${domain}`;
            abuseIPDBStatus.style.color = '#03dac6';
            setTimeout(() => {
                abuseIPDBStatus.textContent = '';
            }, 3000);
        }
    }
});

// Update the API key save functionality with better validation
document.getElementById('saveApiKey')?.addEventListener('click', async () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiStatus = document.getElementById('apiStatus');
    
    if (!apiKeyInput || !apiStatus) return;
    
    const apiKey = apiKeyInput.value.trim();

    if (apiKey.length < 64) {
        apiStatus.textContent = 'Invalid API key format';
        apiStatus.style.color = '#ff4757';
        return;
    }

    try {
        // Test the API key with a sample request
        const response = await fetch('https://www.virustotal.com/api/v3/domains/google.com', {
            method: 'GET',
            headers: {
                'x-apikey': apiKey
            }
        });

        const data = await response.json();

        // Check if we got a valid response structure, even if it's an error
        if (response.status === 401) {
            apiStatus.textContent = 'Invalid API key';
            apiStatus.style.color = '#ff4757';
            return;
        }

        // If we get any response that has data, consider it valid
        if (data) {
            await chrome.storage.local.set({ apiKey });
            apiStatus.textContent = 'API Key saved successfully';
            apiStatus.style.color = '#03dac6';
            apiKeyInput.value = '••••' + apiKey.slice(-4);
        } else {
            apiStatus.textContent = 'Invalid API response';
            apiStatus.style.color = '#ff4757';
        }
    } catch (error) {
        console.error('API key validation error:', error);
        // If we get here, it might be a network error rather than an invalid key
        // Save the key anyway since it might work when the network is better
        await chrome.storage.local.set({ apiKey });
        apiStatus.textContent = 'API Key saved (could not validate)';
        apiStatus.style.color = '#ffa500'; // Orange color for warning
        apiKeyInput.value = '••••' + apiKey.slice(-4);
    }
});

// Add this with your other event listeners
document.getElementById('saveAbuseIPDBKey')?.addEventListener('click', async () => {
    const abuseIPDBKeyInput = document.getElementById('abuseIPDBKeyInput');
    const abuseIPDBStatus = document.getElementById('abuseIPDBStatus');
    
    if (!abuseIPDBKeyInput || !abuseIPDBStatus) return;
    
    const key = abuseIPDBKeyInput.value.trim();

    try {
        // Test the API key with a sample request
        const response = await fetch('https://api.abuseipdb.com/api/v2/check?ipAddress=8.8.8.8', {
            method: 'GET',
            headers: {
                'Key': key,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data) {
            await chrome.storage.local.set({ abuseIPDBKey: key });
            abuseIPDBStatus.textContent = 'AbuseIPDB Key saved successfully';
            abuseIPDBStatus.style.color = '#03dac6';
            abuseIPDBKeyInput.value = '••••' + key.slice(-4);
        } else {
            abuseIPDBStatus.textContent = 'Invalid API key';
            abuseIPDBStatus.style.color = '#ff4757';
        }
    } catch (error) {
        console.error('API key validation error:', error);
        abuseIPDBStatus.textContent = 'Error validating API key';
        abuseIPDBStatus.style.color = '#ff4757';
    }
});

// Add cleanup code
window.addEventListener('unload', () => {
    // Cleanup any pending operations
    const port = chrome.runtime.connect();
    port.disconnect();
});

// Add this with your other DOMContentLoaded event listeners
document.getElementById('dashboardButton').addEventListener('click', () => {
    // Open dashboard in a new tab
    chrome.tabs.create({ url: 'dashboard.html' });
});
