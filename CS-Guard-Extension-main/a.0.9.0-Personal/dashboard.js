// Add this function to format the time difference
function formatTimeDifference(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Update the updateDashboardStats function to include blocking activity
async function updateDashboardStats() {
    try {
        const db = await readDatabase();
        
        // Basic statistics
        const totalBlocked = db.blockedUrls.length;
        const totalWhitelisted = db.whitelistedUrls.length;
        const totalScanned = Object.keys(db.timestamps?.checked || {}).length;
        
        // Calculate percentages
        const maliciousPercentage = totalScanned > 0 
            ? ((totalBlocked / totalScanned) * 100).toFixed(1)
            : 0;
        const safePercentage = totalScanned > 0
            ? (100 - maliciousPercentage).toFixed(1)
            : 0;

        // Calculate blocked sites today
        const today = new Date().setHours(0, 0, 0, 0);
        const blockedToday = Object.entries(db.timestamps?.blocked || {})
            .filter(([_, timestamp]) => timestamp >= today)
            .length;

        // Update stat cards
        document.getElementById('totalBlocked').textContent = totalBlocked;
        document.getElementById('totalWhitelisted').textContent = totalWhitelisted;
        document.getElementById('maliciousPercentage').textContent = `${maliciousPercentage}%`;
        document.getElementById('totalScanned').textContent = totalScanned;
        document.getElementById('todayBlocked').textContent = blockedToday;
        
        // Update last scan time
        const lastScanTimestamp = Math.max(
            ...Object.values(db.timestamps?.checked || {}).filter(Boolean)
        );
        
        document.getElementById('lastScan').textContent = lastScanTimestamp 
            ? new Date(lastScanTimestamp).toLocaleDateString()
            : 'Never';

        // Update progress bars
        const safeSitesBar = document.getElementById('safeSitesBar');
        const maliciousSitesBar = document.getElementById('maliciousSitesBar');
        const safeSitesPercentage = document.getElementById('safeSitesPercentage');
        const maliciousSitesPercentage = document.getElementById('maliciousSitesPercentage');

        safeSitesBar.style.width = `${safePercentage}%`;
        maliciousSitesBar.style.width = `${maliciousPercentage}%`;
        safeSitesPercentage.textContent = `${safePercentage}%`;
        maliciousSitesPercentage.textContent = `${maliciousPercentage}%`;

        // Update activity list
        const activityList = document.getElementById('activityList');
        activityList.innerHTML = '';

        // Combine and sort all timestamps
        const activities = [
            ...Object.entries(db.timestamps?.blocked || {}).map(([domain, time]) => ({
                domain,
                time,
                type: 'blocked',
                class: 'blocked'
            })),
            ...Object.entries(db.timestamps?.whitelisted || {}).map(([domain, time]) => ({
                domain,
                time,
                type: 'whitelisted',
                class: 'whitelisted'
            }))
        ].sort((a, b) => b.time - a.time).slice(0, 10);

        activities.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = `activity-item ${activity.class}`;
            activityItem.innerHTML = `
                <span>${activity.domain} was ${activity.type}</span>
                <span class="timestamp">${new Date(activity.time).toLocaleString()}</span>
            `;
            activityList.appendChild(activityItem);
        });

        // Update blocking activity chart
        const blockingChart = document.getElementById('blockingChart');
        blockingChart.innerHTML = '';

        // Get blocked sites with timestamps and sort by most recent
        const blockedSites = Object.entries(db.timestamps?.blocked || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10); // Show last 10 blocked sites

        blockedSites.forEach(([domain, timestamp]) => {
            const blockingItem = document.createElement('div');
            blockingItem.className = 'blocking-item';
            blockingItem.innerHTML = `
                <span class="blocking-domain">${domain}</span>
                <span class="blocking-time">${formatTimeDifference(timestamp)}</span>
            `;
            blockingChart.appendChild(blockingItem);
        });

    } catch (error) {
        console.error('Error updating dashboard stats:', error);
    }
}

// Add theme toggle functionality
document.addEventListener('DOMContentLoaded', async () => {
    // Load dark/light mode preference
    chrome.storage.local.get('darkMode', (result) => {
        const isDarkMode = result.darkMode === undefined ? true : result.darkMode;
        document.getElementById('darkModeToggle').checked = isDarkMode;
        if (!isDarkMode) {
            document.body.classList.add('light-mode');
        }
    });

    // Add theme toggle listener
    document.getElementById('darkModeToggle').addEventListener('change', (e) => {
        const isDarkMode = e.target.checked;
        if (isDarkMode) {
            document.body.classList.remove('light-mode');
        } else {
            document.body.classList.add('light-mode');
        }
        chrome.storage.local.set({ darkMode: isDarkMode });
    });

    // Update dashboard statistics
    await updateDashboardStats();
});

// Add auto-refresh functionality
setInterval(updateDashboardStats, 30000); // Update every 30 seconds

// Listen for database changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        updateDashboardStats();
    }
}); 