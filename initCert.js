'use strict';

const path = require('path');
const fs = require('fs');

async function initCert() {
  const certDir = path.resolve(__dirname, '.anyproxy/certificates');
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const rootCrt = path.join(certDir, 'rootCA.crt');
  const rootKey = path.join(certDir, 'rootCA.key');

  if (fs.existsSync(rootCrt) && fs.existsSync(rootKey)) {
    console.log('[Cert] Root CA already exists at:', rootCrt);
    return;
  }

  console.log('[Cert] Generating Root CA certificate (Valid for 10 years)...');
  let EasyCert;
  try {
    EasyCert = require('node-easy-cert');
  } catch (e) {
    try {
      EasyCert = require('anyproxy/node_modules/node-easy-cert');
    } catch (err) {
      console.error('[Cert] Error loading node-easy-cert:', err.message);
      return;
    }
  }

  const easyCert = new EasyCert({
    rootDirPath: certDir
  });

  easyCert.generateRootCA({
    commonName: 'AnyProxy',
    overwrite: true
  }, (err, keyPath, crtPath) => {
    if (err) {
      console.error('[Cert] Failed to generate Root CA:', err);
    } else {
      console.log('[Cert] Successfully generated Root CA:');
      console.log(' - CRT:', crtPath);
      console.log(' - KEY:', keyPath);
    }
  });
}

if (require.main === module) {
  initCert();
}

module.exports = { initCert };
