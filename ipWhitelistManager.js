'use strict';

const fs = require('fs');
const path = require('path');

const WHITELIST_FILE = path.resolve(__dirname, 'ip_whitelist.json');

let config = {
  enabled: true,
  stealthMode: false,
  allowedIps: [
    '127.0.0.1',
    '27.79.75.216'
  ]
};

function loadConfig() {
  try {
    if (fs.existsSync(WHITELIST_FILE)) {
      const data = fs.readFileSync(WHITELIST_FILE, 'utf8');
      config = Object.assign({}, config, JSON.parse(data));
    } else {
      saveConfig();
    }
  } catch (e) {
    console.error('[IpWhitelist] Error loading whitelist config:', e.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('[IpWhitelist] Error saving whitelist config:', e.message);
  }
}

function cleanIp(ip) {
  if (!ip) return '';
  let clean = ip.trim();
  if (clean.startsWith('::ffff:')) {
    clean = clean.substring(7);
  }
  if (clean === '::1') {
    clean = '127.0.0.1';
  }
  return clean;
}

function ipMatchesPattern(pattern, ip) {
  pattern = pattern.trim();
  if (!pattern) return false;
  if (pattern === ip) return true;

  // Wildcard matching, e.g. 192.168.1.* or 27.79.*
  if (pattern.includes('*')) {
    try {
      const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      return new RegExp(regexStr).test(ip);
    } catch (e) {
      return false;
    }
  }

  // CIDR matching, e.g. 192.168.1.0/24
  if (pattern.includes('/')) {
    try {
      const [range, bits] = pattern.split('/');
      const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
      const ip2long = addr => addr.split('.').reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0);
      return (ip2long(ip) & mask) === (ip2long(range) & mask);
    } catch (e) {
      return false;
    }
  }

  return false;
}

function isIpAllowed(rawIp) {
  if (!config.enabled) {
    return true; // Whitelist disabled -> allow all
  }

  const clientIp = cleanIp(rawIp);
  if (!clientIp) return false;

  // Always allow localhost
  if (clientIp === '127.0.0.1' || clientIp === 'localhost') {
    return true;
  }

  const allowedList = config.allowedIps || [];
  for (const pattern of allowedList) {
    if (ipMatchesPattern(pattern, clientIp)) {
      return true;
    }
  }

  return false;
}

function getWhitelistConfig() {
  return {
    enabled: !!config.enabled,
    stealthMode: !!config.stealthMode,
    allowedIps: config.allowedIps || []
  };
}

function setWhitelistConfig(newConfig) {
  if (typeof newConfig.enabled === 'boolean') {
    config.enabled = newConfig.enabled;
  }
  if (typeof newConfig.stealthMode === 'boolean') {
    config.stealthMode = newConfig.stealthMode;
  }
  if (Array.isArray(newConfig.allowedIps)) {
    config.allowedIps = newConfig.allowedIps.map(cleanIp).filter(Boolean);
  }
  saveConfig();
  return getWhitelistConfig();
}

function addIp(ip) {
  const cleaned = cleanIp(ip);
  if (!cleaned) return false;
  if (!config.allowedIps) config.allowedIps = [];
  if (!config.allowedIps.includes(cleaned)) {
    config.allowedIps.push(cleaned);
    saveConfig();
  }
  return getWhitelistConfig();
}

function removeIp(ip) {
  const cleaned = cleanIp(ip);
  if (!config.allowedIps) return getWhitelistConfig();
  config.allowedIps = config.allowedIps.filter(item => cleanIp(item) !== cleaned);
  saveConfig();
  return getWhitelistConfig();
}

function isStealthMode() {
  return !!config.stealthMode;
}

// Load on startup
loadConfig();

module.exports = {
  cleanIp,
  isIpAllowed,
  isStealthMode,
  getWhitelistConfig,
  setWhitelistConfig,
  addIp,
  removeIp
};
