'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const rulesManager = require('./rulesManager');
const ipWhitelistManager = require('./ipWhitelistManager');

function registerComposerRoutes(app, recorder) {
  // 1. API: Execute HTTP/HTTPS request directly (Replay / Composer)
  app.post('/api/composer/send', (req, res) => {
    const { method = 'GET', url: targetUrl, headers = {}, body = '', timeout = 30000 } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL: ' + e.message });
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const cleanHeaders = Object.assign({}, headers);
    // Remove headers that should be calculated
    delete cleanHeaders['host'];
    delete cleanHeaders['content-length'];

    let bodyBuffer = null;
    if (body) {
      bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      cleanHeaders['content-length'] = bodyBuffer.length;
    }

    const reqOptions = {
      method: method.toUpperCase(),
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: cleanHeaders,
      timeout: timeout,
      rejectUnauthorized: false // Ignore upstream SSL cert errors
    };

    const startTime = Date.now();
    const request = client.request(reqOptions, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const durationMs = Date.now() - startTime;
        const respBuffer = Buffer.concat(chunks);
        const respBody = respBuffer.toString('utf8');

        let isJson = false;
        let parsedJson = null;
        try {
          parsedJson = JSON.parse(respBody);
          isJson = true;
        } catch (e) {}

        res.json({
          success: true,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
          durationMs,
          bodySize: respBuffer.length,
          body: respBody,
          json: isJson ? parsedJson : null,
          isJson
        });
      });
    });

    request.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      res.json({
        success: false,
        error: err.message || err.toString(),
        durationMs
      });
    });

    request.on('timeout', () => {
      request.destroy();
      res.json({
        success: false,
        error: 'Request timeout after ' + timeout + 'ms',
        durationMs: Date.now() - startTime
      });
    });

    if (bodyBuffer) {
      request.write(bodyBuffer);
    }
    request.end();
  });

  // 2. API: Get captured requests with body for quick replay
  app.get('/api/composer/captured', (req, res) => {
    if (!recorder) {
      return res.json([]);
    }
    recorder.getRecords(null, 50, (err, docs) => {
      if (err || !docs) {
        return res.json([]);
      }
      const simplified = docs.map(doc => ({
        id: doc.id,
        method: doc.method,
        host: doc.host,
        path: doc.path,
        url: doc.url,
        protocol: doc.protocol,
        statusCode: doc.statusCode,
        mime: doc.mime,
        reqHeader: doc.reqHeader,
        reqBody: doc.reqBody || '',
        resHeader: doc.resHeader,
        endTime: doc.endTime
      }));
      res.json(simplified);
    });
  });

  // 2b. API: Get single record by ID with full details
  app.get('/api/composer/record', (req, res) => {
    const { id } = req.query;
    if (!id || !recorder) {
      return res.status(400).json({ error: 'Missing id or recorder' });
    }
    recorder.getSingleRecord(id, (err, doc) => {
      if (err || !doc || !doc[0]) {
        return res.status(404).json({ error: 'Record not found' });
      }
      const item = doc[0];
      recorder.getDecodedBody(id, (errBody, bodyResult) => {
        const fullUrl = item.url || ((item.protocol || 'https') + '://' + item.host + (item.path || ''));
        res.json({
          id: item.id,
          method: item.method || 'GET',
          url: fullUrl,
          protocol: item.protocol,
          host: item.host,
          path: item.path,
          headers: item.reqHeader || {},
          reqBody: item.reqBody || '',
          resHeaders: item.resHeader || {},
          resBody: (bodyResult && bodyResult.content) || '',
          statusCode: item.statusCode
        });
      });
    });
  });

  // 3. API: Get & Set Rewrite Rules
  app.get('/api/composer/rules', (req, res) => {
    res.json(rulesManager.getRules());
  });

  app.post('/api/composer/rules', (req, res) => {
    const success = rulesManager.setRules(req.body);
    res.json({ success, rules: rulesManager.getRules() });
  });

  app.post('/api/composer/rules/add', (req, res) => {
    const newRule = req.body;
    if (!newRule || !newRule.urlPattern) {
      return res.status(400).json({ error: 'urlPattern is required' });
    }
    const currentRules = rulesManager.getRules() || [];
    newRule.id = newRule.id || ('rule_' + Date.now());
    newRule.enabled = newRule.enabled !== false;
    currentRules.unshift(newRule);
    rulesManager.setRules(currentRules);
    res.json({ success: true, rule: newRule, rules: currentRules });
  });

  // 3b. External Rule File Endpoints (Multi-rule management)
  app.get('/api/composer/external-rules', (req, res) => {
    res.json({ success: true, rules: rulesManager.getExternalRulesList() });
  });

  app.post('/api/composer/external-rules/toggle', (req, res) => {
    const { id, enabled } = req.body;
    const rules = rulesManager.toggleExternalRule(id, enabled);
    res.json({ success: true, rules });
  });

  app.post('/api/composer/external-rules/add', (req, res) => {
    const { path: rulePath, name } = req.body;
    if (!rulePath) {
      return res.status(400).json({ error: 'path is required' });
    }
    const rules = rulesManager.addExternalRule(rulePath, name);
    res.json({ success: true, rules });
  });

  app.post('/api/composer/external-rules/remove', (req, res) => {
    const { id } = req.body;
    const rules = rulesManager.removeExternalRule(id);
    res.json({ success: true, rules });
  });

  // Legacy single-rule endpoints (backward compatibility)
  app.get('/api/composer/external-rule', (req, res) => {
    res.json(rulesManager.getExternalRuleConfig());
  });

  app.post('/api/composer/external-rule', (req, res) => {
    const config = rulesManager.setExternalRuleConfig(req.body);
    res.json({ success: true, config });
  });

  app.get('/api/composer/read-rule-file', (req, res) => {
    const { filePath } = req.query;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.json({ success: true, content });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/composer/save-rule-file', (req, res) => {
    const { filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }
    try {
      fs.writeFileSync(filePath, content || '', 'utf8');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3c. IP Whitelist Endpoints (Protect Proxy Port 8001)
  app.get('/api/composer/whitelist', (req, res) => {
    const rawClientIp = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0]
      : (req.socket && req.socket.remoteAddress);
    const clientIp = ipWhitelistManager.cleanIp(rawClientIp);
    res.json(Object.assign({ clientIp }, ipWhitelistManager.getWhitelistConfig()));
  });

  app.post('/api/composer/whitelist', (req, res) => {
    const updated = ipWhitelistManager.setWhitelistConfig(req.body);
    res.json({ success: true, config: updated });
  });

  app.post('/api/composer/whitelist/add', (req, res) => {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ error: 'IP is required' });
    }
    const updated = ipWhitelistManager.addIp(ip);
    res.json({ success: true, config: updated });
  });

  app.post('/api/composer/whitelist/remove', (req, res) => {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ error: 'IP is required' });
    }
    const updated = ipWhitelistManager.removeIp(ip);
    res.json({ success: true, config: updated });
  });

  // 4. Serve Composer UI HTML
  app.get('/composer', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const htmlPath = path.resolve(__dirname, 'composer.html');
    if (fs.existsSync(htmlPath)) {
      res.send(fs.readFileSync(htmlPath, 'utf8'));
    } else {
      res.status(404).send('composer.html not found');
    }
  });

  // 5. Serve injected Edit Helper JS
  app.get('/editHelper.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    const helperPath = path.resolve(__dirname, 'web/editHelper.js');
    if (fs.existsSync(helperPath)) {
      res.sendFile(helperPath);
    } else {
      res.status(404).send('editHelper.js not found');
    }
  });
}

module.exports = {
  registerComposerRoutes
};
