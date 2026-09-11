'use strict';

const fs = require('fs');
const path = require('path');
const { initCert } = require('./initCert');

console.log('=== [AnyProxy Setup & Patching] ===');

// 1. Patch node-easy-cert for 10-year CA and 365-day Leaf domain validity
function patchCertGenerator() {
  const possiblePaths = [
    path.resolve(__dirname, 'node_modules/node-easy-cert/dist/certGenerator.js'),
    path.resolve(__dirname, 'node_modules/anyproxy/node_modules/node-easy-cert/dist/certGenerator.js')
  ];

  for (const certGenPath of possiblePaths) {
    if (fs.existsSync(certGenPath)) {
      let content = fs.readFileSync(certGenPath, 'utf8');
      let changed = false;

      // Ensure root CA has 10-year validity
      if (content.includes('cert.validity.notAfter = new Date(now + 10 * 365 * 24 * 60 * 60 * 1000);')) {
        console.log('[Patch] certGenerator.js already has 10-year CA validity.');
      } else {
        content = content.replace(
          /cert\.validity\.notAfter\s*=\s*new Date\(now\s*\+\s*[^)]+\);/,
          'cert.validity.notAfter = new Date(now + 10 * 365 * 24 * 60 * 60 * 1000);'
        );
        changed = true;
      }

      // Ensure leaf domain certificates have 365-day validity (Apple iOS compliance)
      if (content.includes('cert.validity.notAfter = new Date(now + 365 * 24 * 60 * 60 * 1000);')) {
        console.log('[Patch] certGenerator.js already has 365-day leaf validity.');
      } else {
        const parts = content.split('cert.validity.notAfter = new Date(now + 10 * 365 * 24 * 60 * 60 * 1000);');
        if (parts.length > 1) {
          parts[1] = parts[1].replace(
            /cert\.validity\.notAfter\s*=\s*new Date\(now\s*\+\s*[^)]+\);/,
            'cert.validity.notAfter = new Date(now + 365 * 24 * 60 * 60 * 1000);'
          );
          content = parts.join('cert.validity.notAfter = new Date(now + 10 * 365 * 24 * 60 * 60 * 1000);');
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(certGenPath, content, 'utf8');
        console.log('[Patch] Patched certGenerator.js successfully at:', certGenPath);
      }
    }
  }
}

// 2. Patch anyproxy webInterface.js to mount composer routes
function patchWebInterface() {
  const webInterfacePath = path.resolve(__dirname, 'node_modules/anyproxy/lib/webInterface.js');
  if (fs.existsSync(webInterfacePath)) {
    let content = fs.readFileSync(webInterfacePath, 'utf8');
    if (!content.includes('composerServer.registerComposerRoutes')) {
      const target = 'app.use(bodyParser.json());';
      const hook = `app.use(bodyParser.json());

    try {
      const composerServer = require(path.resolve(__dirname, '../../../composerServer'));
      composerServer.registerComposerRoutes(app, recorder);
    } catch (e) {
      console.error('[WebInterface] Error mounting composer routes:', e);
    }`;
      content = content.replace(target, hook);
      fs.writeFileSync(webInterfacePath, content, 'utf8');
      console.log('[Patch] Hooked composerServer into anyproxy webInterface.js');
    } else {
      console.log('[Patch] webInterface.js already hooked with composerServer.');
    }
  }
}

// 3. Patch anyproxy web/index.html to inject editHelper.js
function patchIndexHtml() {
  const indexPath = path.resolve(__dirname, 'node_modules/anyproxy/web/index.html');
  if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');
    if (!content.includes('src="/editHelper.js"')) {
      content = content.replace('</body>', '  <script type="text/javascript" src="/editHelper.js"></script>\n</body>');
      fs.writeFileSync(indexPath, content, 'utf8');
      console.log('[Patch] Injected /editHelper.js into anyproxy web/index.html');
    } else {
      console.log('[Patch] web/index.html already has editHelper.js injected.');
    }
  }

  // Also copy web/editHelper.js into node_modules/anyproxy/web/editHelper.js if exists
  const srcHelper = path.resolve(__dirname, 'web/editHelper.js');
  const destHelper = path.resolve(__dirname, 'node_modules/anyproxy/web/editHelper.js');
  if (fs.existsSync(srcHelper) && fs.existsSync(path.dirname(destHelper))) {
    fs.copyFileSync(srcHelper, destHelper);
    console.log('[Patch] Synced web/editHelper.js to anyproxy/web/editHelper.js');
  }
}

// 4. Initialize config templates if not exist
function initConfigs() {
  const rewriteRulesPath = path.resolve(__dirname, 'rewrite_rules.json');
  if (!fs.existsSync(rewriteRulesPath)) {
    fs.writeFileSync(rewriteRulesPath, '[]', 'utf8');
    console.log('[Config] Created empty rewrite_rules.json');
  }

  const extConfigPath = path.resolve(__dirname, 'external_rule_config.json');
  if (!fs.existsSync(extConfigPath)) {
    const defaultExt = {
      enabled: false,
      rulePath: '',
      recentPaths: []
    };
    fs.writeFileSync(extConfigPath, JSON.stringify(defaultExt, null, 2), 'utf8');
    console.log('[Config] Created default external_rule_config.json');
  }

  const ipWhitelistPath = path.resolve(__dirname, 'ip_whitelist.json');
  if (!fs.existsSync(ipWhitelistPath)) {
    const defaultWl = {
      enabled: false,
      stealthMode: false,
      allowedIps: ['127.0.0.1']
    };
    fs.writeFileSync(ipWhitelistPath, JSON.stringify(defaultWl, null, 2), 'utf8');
    console.log('[Config] Created default ip_whitelist.json');
  }
}

// Run all
patchCertGenerator();
patchWebInterface();
patchIndexHtml();
initConfigs();
initCert();

console.log('=== [AnyProxy Setup & Patching Complete!] ===\n');
