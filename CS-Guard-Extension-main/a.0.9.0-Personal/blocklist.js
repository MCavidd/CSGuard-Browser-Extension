const blocklist = [];

export function addDomainToBlocklist(domain) {
  console.log('Adding domain to blocklist:', domain);
  if (!blocklist.includes(domain)) {
    blocklist.push(domain);
    console.log('Updated blocklist:', blocklist);
  } else {
    console.log('Domain already in blocklist');
  }
}

export function isDomainBlocked(domain) {
  console.log('Checking if domain is blocked:', domain);
  const isBlocked = blocklist.includes(domain);
  console.log('Domain blocked status:', isBlocked);
  return isBlocked;
}