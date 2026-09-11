'use strict';

const fs = require('fs');
const path = require('path');

const RULES_FILE = path.resolve(__dirname, 'rewrite_rules.json');

let rules = [];

// Load rules from file if exists
function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const data = fs.readFileSync(RULES_FILE, 'utf8');
      rules = JSON.parse(data);
    }
  } catch (err) {
    console.error('[RulesManager] Failed to load rules:', err);
    rules = [];
  }
}

// Save rules to file
function saveRules() {
  try {
    fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf8');
  } catch (err) {
    console.error('[RulesManager] Failed to save rules:', err);
  }
}

loadRules();

function getRules() {
  return rules;
}

function setRules(newRules) {
  if (Array.isArray(newRules)) {
    rules = newRules;
  } else if (newRules && Array.isArray(newRules.rules)) {
    rules = newRules.rules;
  } else if (newRules && typeof newRules === 'object') {
    rules = [newRules];
  } else {
    return false;
  }
  saveRules();
  return true;
}

function matchRule(rule, method, url) {
  if (!rule.enabled) return false;

  // Match method
  if (rule.matchMethod && rule.matchMethod !== 'ALL') {
    if (rule.matchMethod.toUpperCase() !== (method || '').toUpperCase()) {
      return false;
    }
  }

  // Match URL pattern
  if (rule.urlPattern) {
    try {
      if (rule.isRegex) {
        const re = new RegExp(rule.urlPattern, 'i');
        if (!re.test(url)) return false;
      } else {
        if (!url.toLowerCase().includes(rule.urlPattern.toLowerCase())) {
          return false;
        }
      }
    } catch (e) {
      return false;
    }
  }

  return true;
}

// Modify Request
function modifyRequest(requestDetail) {
  const method = (requestDetail.requestOptions && requestDetail.requestOptions.method) || 'GET';
  const proto = requestDetail.protocol || 'http';
  const host = (requestDetail.requestOptions && requestDetail.requestOptions.hostname) || '';
  const reqPath = (requestDetail.requestOptions && requestDetail.requestOptions.path) || '';
  const fullUrl = `${proto}://${host}${reqPath}`;

  let modified = false;
  let newHeaders = Object.assign({}, (requestDetail.requestOptions && requestDetail.requestOptions.headers) || {});
  let bodyStr = (requestDetail.requestData || '').toString();

  for (const rule of rules) {
    if (matchRule(rule, method, fullUrl)) {
      // Modify Request Headers
      if (rule.modifyRequestHeaders && typeof rule.modifyRequestHeaders === 'object') {
        for (const [key, val] of Object.entries(rule.modifyRequestHeaders)) {
          if (val === null || val === '') {
            delete newHeaders[key.toLowerCase()];
            delete newHeaders[key];
          } else {
            newHeaders[key] = val;
          }
          modified = true;
        }
      }

      // Modify Request Body
      if (rule.modifyRequestBody) {
        const mod = rule.modifyRequestBody;
        if (mod.mode === 'full' && typeof mod.content === 'string') {
          bodyStr = mod.content;
          modified = true;
        } else if (mod.mode === 'replace' && mod.search != null && mod.replace != null) {
          bodyStr = bodyStr.split(mod.search).join(mod.replace);
          modified = true;
        } else if (mod.mode === 'regex' && mod.search != null && mod.replace != null) {
          try {
            const re = new RegExp(mod.search, 'g');
            bodyStr = bodyStr.replace(re, mod.replace);
            modified = true;
          } catch (e) {}
        }
      }

      if (modified) {
        console.log(`[Rule Applied: "${rule.name}"] Modified Request -> ${fullUrl}`);
      }
    }
  }

  if (modified) {
    if (newHeaders['content-length'] != null) {
      newHeaders['content-length'] = Buffer.byteLength(bodyStr, 'utf8');
    }
    return {
      requestOptions: Object.assign({}, requestDetail.requestOptions, { headers: newHeaders }),
      requestData: Buffer.from(bodyStr, 'utf8')
    };
  }

  return null;
}

// Evaluate IF-ELSE conditions for a rule
function evaluateCondition(rule, reqContext, resContext) {
  if (!rule.condition || !rule.condition.enabled) {
    return { matched: true, action: 'then' };
  }

  const cond = rule.condition;

  // 1. Script Mode (Custom JavaScript)
  if (cond.type === 'script' && cond.scriptCode) {
    try {
      const fn = new Function('req', 'res', cond.scriptCode);
      const result = fn(reqContext, resContext);
      if (typeof result === 'boolean') {
        return { matched: result, action: result ? 'then' : (rule.elseAction || 'passthrough') };
      }
      if (result && typeof result === 'object') {
        return { matched: true, customResult: result };
      }
      return { matched: false, action: rule.elseAction || 'passthrough' };
    } catch (e) {
      console.error(`[Rule "${rule.name}"] Script Condition Error:`, e.message);
      return { matched: false, action: 'passthrough' };
    }
  }

  // 2. Simple Visual Condition
  let targetVal = '';
  switch (cond.field) {
    case 'reqBody':
      targetVal = reqContext.body || '';
      break;
    case 'url':
      targetVal = reqContext.url || '';
      break;
    case 'reqHeader':
      const hKey = (cond.headerKey || '').toLowerCase();
      targetVal = (reqContext.headers && reqContext.headers[hKey]) || '';
      break;
    case 'resBody':
      targetVal = (resContext && resContext.body) || '';
      break;
    case 'resStatus':
      targetVal = String((resContext && resContext.statusCode) || '');
      break;
    case 'always':
      return { matched: true, action: 'then' };
    default:
      targetVal = reqContext.body || '';
  }

  const expectedVal = cond.value != null ? String(cond.value) : '';
  let isMatch = false;

  switch (cond.operator) {
    case 'contains':
      isMatch = targetVal.toLowerCase().includes(expectedVal.toLowerCase());
      break;
    case 'not_contains':
      isMatch = !targetVal.toLowerCase().includes(expectedVal.toLowerCase());
      break;
    case 'equals':
      isMatch = targetVal.trim() === expectedVal.trim();
      break;
    case 'not_equals':
      isMatch = targetVal.trim() !== expectedVal.trim();
      break;
    case 'regex':
      try {
        const re = new RegExp(expectedVal, 'i');
        isMatch = re.test(targetVal);
      } catch (e) {
        isMatch = false;
      }
      break;
    case 'starts_with':
      isMatch = targetVal.startsWith(expectedVal);
      break;
    case 'ends_with':
      isMatch = targetVal.endsWith(expectedVal);
      break;
    default:
      isMatch = targetVal.toLowerCase().includes(expectedVal.toLowerCase());
  }

  if (isMatch) {
    return { matched: true, action: 'then' };
  } else {
    return { matched: false, action: rule.elseAction || 'passthrough' };
  }
}

// Modify Response
function modifyResponse(requestDetail, responseDetail) {
  const method = (requestDetail.requestOptions && requestDetail.requestOptions.method) || 'GET';
  const proto = requestDetail.protocol || 'http';
  const host = (requestDetail.requestOptions && requestDetail.requestOptions.hostname) || '';
  const reqPath = (requestDetail.requestOptions && requestDetail.requestOptions.path) || '';
  const fullUrl = `${proto}://${host}${reqPath}`;

  let modified = false;
  let newStatusCode = responseDetail.response.statusCode;
  let newHeaders = Object.assign({}, responseDetail.response.header || {});
  let bodyStr = (responseDetail.response.body || '').toString();

  const reqBodyStr = (requestDetail.requestData || '').toString();
  const reqContext = {
    method,
    url: fullUrl,
    headers: (requestDetail.requestOptions && requestDetail.requestOptions.headers) || {},
    body: reqBodyStr
  };
  const resContext = {
    statusCode: responseDetail.response.statusCode,
    headers: responseDetail.response.header || {},
    body: bodyStr
  };

  for (const rule of rules) {
    if (matchRule(rule, method, fullUrl)) {
      const condResult = evaluateCondition(rule, reqContext, resContext);

      // If script returned a custom object { statusCode, headers, body }
      if (condResult.customResult) {
        const cr = condResult.customResult;
        if (cr.statusCode) newStatusCode = parseInt(cr.statusCode, 10);
        if (cr.headers && typeof cr.headers === 'object') Object.assign(newHeaders, cr.headers);
        if (typeof cr.body === 'string') bodyStr = cr.body;
        else if (cr.body && typeof cr.body === 'object') bodyStr = JSON.stringify(cr.body, null, 2);
        modified = true;
        console.log(`[Rule Script: "${rule.name}"] Generated custom response -> ${fullUrl}`);
        break;
      }

      if (condResult.matched) {
        // THEN Branch: Apply standard mock rewrite
        if (rule.modifyResponseStatusCode) {
          const sc = parseInt(rule.modifyResponseStatusCode, 10);
          if (!isNaN(sc) && sc > 0) {
            newStatusCode = sc;
            modified = true;
          }
        }

        if (rule.modifyResponseHeaders && typeof rule.modifyResponseHeaders === 'object') {
          for (const [key, val] of Object.entries(rule.modifyResponseHeaders)) {
            if (val === null || val === '') {
              delete newHeaders[key.toLowerCase()];
              delete newHeaders[key];
            } else {
              newHeaders[key] = val;
            }
            modified = true;
          }
        }

        if (rule.modifyResponseBody) {
          const mod = rule.modifyResponseBody;
          if (mod.mode === 'full' && typeof mod.content === 'string') {
            bodyStr = mod.content;
            modified = true;
          } else if (mod.mode === 'replace' && mod.search != null && mod.replace != null) {
            bodyStr = bodyStr.split(mod.search).join(mod.replace);
            modified = true;
          } else if (mod.mode === 'regex' && mod.search != null && mod.replace != null) {
            try {
              const re = new RegExp(mod.search, 'g');
              bodyStr = bodyStr.replace(re, mod.replace);
              modified = true;
            } catch (e) {}
          }
        }

        if (modified) {
          console.log(`[Rule Applied: "${rule.name}"] Condition TRUE -> Modified Response -> ${fullUrl}`);
        }
      } else {
        // ELSE Branch
        if (condResult.action === 'custom') {
          if (rule.elseStatusCode) {
            newStatusCode = parseInt(rule.elseStatusCode, 10) || 200;
          }
          if (rule.elseBody != null) {
            bodyStr = typeof rule.elseBody === 'string' ? rule.elseBody : JSON.stringify(rule.elseBody, null, 2);
            modified = true;
          }
          console.log(`[Rule Applied: "${rule.name}"] Condition FALSE -> Applied ELSE response -> ${fullUrl}`);
        } else {
          // passthrough -> do not modify
          console.log(`[Rule Passthrough: "${rule.name}"] Condition FALSE -> Pass original server response -> ${fullUrl}`);
        }
      }
    }
  }

  if (modified) {
    if (newHeaders['content-length'] != null) {
      newHeaders['content-length'] = Buffer.byteLength(bodyStr, 'utf8');
    }
    return {
      response: {
        statusCode: newStatusCode,
        header: newHeaders,
        body: Buffer.from(bodyStr, 'utf8')
      }
    };
  }

  return null;
}

// -------------------------------------------------------------
// External Rule Files Manager (Multiple dynamic .js rules)
// -------------------------------------------------------------
const EXT_CONFIG_FILE = path.resolve(__dirname, 'external_rule_config.json');

let externalRules = [];

function loadExtConfig() {
  try {
    if (fs.existsSync(EXT_CONFIG_FILE)) {
      const data = fs.readFileSync(EXT_CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.rules)) {
        externalRules = parsed.rules;
      } else if (Array.isArray(parsed)) {
        externalRules = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Migration from legacy { enabled, rulePath, recentPaths }
        externalRules = [];
        if (parsed.rulePath) {
          const normPath = parsed.rulePath.replace(/\\/g, '/');
          externalRules.push({
            id: 'ext_rule_1',
            name: path.basename(normPath) || 'rule.js',
            path: normPath,
            enabled: !!parsed.enabled
          });
        }
        if (Array.isArray(parsed.recentPaths)) {
          parsed.recentPaths.forEach((p, idx) => {
            const normP = p.replace(/\\/g, '/');
            if (!externalRules.some(r => r.path === normP)) {
              externalRules.push({
                id: 'ext_rule_' + (idx + 2),
                name: path.basename(normP) || `rule_${idx + 2}.js`,
                path: normP,
                enabled: false
              });
            }
          });
        }
      }
    }
  } catch (e) {
    console.error('[RulesManager] Failed to load external rule config:', e.message);
    externalRules = [];
  }
}

function saveExtConfig() {
  try {
    fs.writeFileSync(EXT_CONFIG_FILE, JSON.stringify({ rules: externalRules }, null, 2), 'utf8');
  } catch (e) {
    console.error('[RulesManager] Failed to save external rule config:', e.message);
  }
}

loadExtConfig();

function getExternalRulesList() {
  return externalRules.map(r => {
    const fileExists = fs.existsSync(r.path);
    let summary = '';
    let loadError = null;

    if (fileExists) {
      try {
        const resolved = path.resolve(r.path);
        delete require.cache[require.resolve(resolved)];
        const mod = require(resolved);
        summary = mod.summary || 'Custom AnyProxy Rule Module';
      } catch (e) {
        loadError = e.message;
      }
    }

    return {
      id: r.id,
      name: r.name || path.basename(r.path),
      path: r.path,
      enabled: !!r.enabled,
      fileExists,
      summary,
      loadError
    };
  });
}

function toggleExternalRule(id, enabled) {
  const rule = externalRules.find(r => r.id === id);
  if (rule) {
    rule.enabled = !!enabled;
    saveExtConfig();
  }
  return getExternalRulesList();
}

function addExternalRule(rulePath, name) {
  if (!rulePath || typeof rulePath !== 'string') return getExternalRulesList();
  const normPath = rulePath.trim().replace(/\\/g, '/');
  const existing = externalRules.find(r => r.path.toLowerCase() === normPath.toLowerCase());
  if (existing) {
    existing.enabled = true;
    if (name) existing.name = name;
  } else {
    externalRules.push({
      id: 'ext_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name || path.basename(normPath) || 'custom_rule.js',
      path: normPath,
      enabled: true
    });
  }
  saveExtConfig();
  return getExternalRulesList();
}

function removeExternalRule(id) {
  externalRules = externalRules.filter(r => r.id !== id);
  saveExtConfig();
  return getExternalRulesList();
}

function getActiveExternalRules() {
  const active = [];
  for (const r of externalRules) {
    if (!r.enabled || !r.path) continue;
    try {
      const resolved = path.resolve(r.path);
      if (!fs.existsSync(resolved)) continue;
      delete require.cache[require.resolve(resolved)];
      const mod = require(resolved);
      active.push({
        id: r.id,
        name: r.name || path.basename(r.path),
        path: r.path,
        module: mod
      });
    } catch (e) {
      console.error(`[RulesManager] Error loading external rule "${r.name}":`, e.message);
    }
  }
  return active;
}

// Backward compatibility helpers
function getExternalRuleConfig() {
  const list = getExternalRulesList();
  const firstActive = list.find(r => r.enabled) || list[0];
  return {
    enabled: list.some(r => r.enabled),
    rulePath: firstActive ? firstActive.path : '',
    recentPaths: list.map(r => r.path),
    fileExists: firstActive ? firstActive.fileExists : false,
    summary: firstActive ? firstActive.summary : '',
    loadError: firstActive ? firstActive.loadError : null,
    rules: list
  };
}

function setExternalRuleConfig(config) {
  if (config && config.rulePath) {
    addExternalRule(config.rulePath);
  }
  return getExternalRuleConfig();
}

function getActiveExternalRule() {
  const list = getActiveExternalRules();
  return list.length > 0 ? list[0].module : null;
}

module.exports = {
  getRules,
  setRules,
  modifyRequest,
  modifyResponse,
  getExternalRulesList,
  toggleExternalRule,
  addExternalRule,
  removeExternalRule,
  getActiveExternalRules,
  getExternalRuleConfig,
  setExternalRuleConfig,
  getActiveExternalRule
};
