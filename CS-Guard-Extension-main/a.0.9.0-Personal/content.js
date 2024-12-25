async function checkBlockedStatus() {
  console.log('Content script running - checking blocked status');
  
  // Check if extension is enabled
  const enabledResult = await chrome.storage.local.get('enabled');
  console.log('Extension enabled status:', enabledResult.enabled);
  
  if (enabledResult.enabled === false) {
    console.log('Extension is disabled, exiting check');
    return;
  }

  const currentDomain = new URL(window.location.href).hostname;
  console.log('Checking domain:', currentDomain);
  
  const result = await chrome.storage.local.get('blockedUrls');
  const blockedUrls = result.blockedUrls || [];
  console.log('Current blocklist:', blockedUrls);
  
  if (blockedUrls.includes(currentDomain)) {
    console.log('Domain is blocked, redirecting to blocked page');
    window.location.replace('C:\\Users\\Student\\Desktop\\a\\blocked.html');
  } else {
    console.log('Domain is safe, allowing access');
  }
}

console.log('Content script loaded');
checkBlockedStatus();
  