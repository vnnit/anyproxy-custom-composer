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
// External Rule File Manager (Dynamic rule .js selection)
// -------------------------------------------------------------
const EXT_CONFIG_FILE = path.resolve(__dirname, 'external_rule_config.json');

let externalRuleConfig = {
  enabled: false,
  rulePath: '',
  recentPaths: []
};

function loadExtConfig() {
  try {
    if (fs.existsSync(EXT_CONFIG_FILE)) {
      const data = fs.readFileSync(EXT_CONFIG_FILE, 'utf8');
      externalRuleConfig = Object.assign({}, externalRuleConfig, JSON.parse(data));
    }
  } catch (e) {
    console.error('[RulesManager] Failed to load external rule config:', e.message);
  }
}

function saveExtConfig() {
  try {
    fs.writeFileSync(EXT_CONFIG_FILE, JSON.stringify(externalRuleConfig, null, 2), 'utf8');
  } catch (e) {
    console.error('[RulesManager] Failed to save external rule config:', e.message);
  }
}

loadExtConfig();

function getExternalRuleConfig() {
  const filePath = externalRuleConfig.rulePath || '';
  const fileExists = fs.existsSync(filePath);
  let summary = '';
  let loadError = null;

  if (fileExists) {
    try {
      const resolved = path.resolve(filePath);
      delete require.cache[require.resolve(resolved)];
      const mod = require(resolved);
      summary = mod.summary || 'Custom AnyProxy Rule Module';
    } catch (e) {
      loadError = e.message;
    }
  }

  return {
    enabled: externalRuleConfig.enabled,
    rulePath: externalRuleConfig.rulePath,
    recentPaths: externalRuleConfig.recentPaths || [],
    fileExists,
    summary,
    loadError
  };
}

function setExternalRuleConfig(config) {
  if (typeof config.enabled === 'boolean') {
    externalRuleConfig.enabled = config.enabled;
  }
  if (config.rulePath && typeof config.rulePath === 'string') {
    const p = config.rulePath.trim();
    externalRuleConfig.rulePath = p;
    if (!externalRuleConfig.recentPaths) externalRuleConfig.recentPaths = [];
    if (!externalRuleConfig.recentPaths.includes(p)) {
      externalRuleConfig.recentPaths.unshift(p);
      if (externalRuleConfig.recentPaths.length > 10) {
        externalRuleConfig.recentPaths = externalRuleConfig.recentPaths.slice(0, 10);
      }
    }
  }
  saveExtConfig();
  return getExternalRuleConfig();
}

function getActiveExternalRule() {
  if (!externalRuleConfig.enabled || !externalRuleConfig.rulePath) {
    return null;
  }
  try {
    const resolved = path.resolve(externalRuleConfig.rulePath);
    if (!fs.existsSync(resolved)) return null;
    delete require.cache[require.resolve(resolved)];
    return require(resolved);
  } catch (e) {
    console.error('[RulesManager] Error loading external rule:', e.message);
    return null;
  }
}

module.exports = {
  getRules,
  setRules,
  modifyRequest,
  modifyResponse,
  getExternalRuleConfig,
  setExternalRuleConfig,
  getActiveExternalRule
};
