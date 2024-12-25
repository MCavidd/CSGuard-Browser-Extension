document.addEventListener('DOMContentLoaded', () => {
    console.log('Blocked page loaded');
    
    const urlParams = new URLSearchParams(window.location.search);
    const blockedDomain = urlParams.get('domain') || 'Unknown Domain';
    const originalUrl = urlParams.get('originalUrl') || `https://${blockedDomain}`;
    
    console.log('Blocked domain:', blockedDomain);
    console.log('Original URL:', originalUrl);

    // Handle back button
    document.getElementById('backButton').addEventListener('click', () => {
        window.history.back();
    });

    // Handle allow access button
    document.getElementById('allowButton').addEventListener('click', async () => {
        console.log('Allow access button clicked');
        try {
            await removeFromBlocklist(blockedDomain);
            await addToWhitelist(blockedDomain);
            window.location.href = originalUrl;
        } catch (error) {
            console.error('Error in allow access:', error);
            window.location.href = originalUrl;
        }
    });
}); 