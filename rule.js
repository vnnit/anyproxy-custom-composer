'use strict';

const path = require('path');
const rulesManager = require('./rulesManager');

// External rule is loaded dynamically via rulesManager.getActiveExternalRule()

module.exports = {
  summary: 'SSL Debug, Composer & Custom External Rule Handler',

  // Force intercept all HTTPS requests
  *beforeDealHttpsRequest(requestDetail) {
    const activeRules = rulesManager.getActiveExternalRules();
    for (const item of activeRules) {
      if (item.module && item.module.beforeDealHttpsRequest) {
        try {
          const res = yield item.module.beforeDealHttpsRequest(requestDetail);
          if (typeof res === 'boolean') {
            if (res) return true;
          }
        } catch (err) {
          console.error(`[ExternalRule ${item.name} beforeDealHttpsRequest Error]:`, err.message || err);
        }
      }
    }
    console.log(`[SSL Intercept] Intercepting HTTPS -> ${requestDetail.host}`);
    return true;
  },

  // Log and optionally modify outgoing requests
  *beforeSendRequest(requestDetail) {
    const proto = requestDetail.protocol || 'http';
    const host = (requestDetail.requestOptions && requestDetail.requestOptions.hostname) || '';
    const pathStr = (requestDetail.requestOptions && requestDetail.requestOptions.path) || '';
    const port = (requestDetail.requestOptions && requestDetail.requestOptions.port) || (proto === 'https' ? 443 : 80);
    const method = (requestDetail.requestOptions && requestDetail.requestOptions.method) || 'GET';

    // Prevent recursive proxy loops to proxy itself
    if ((host === '144.202.92.46' || host === '127.0.0.1' || host === 'localhost') && (port == 8001 || port == 8002)) {
      console.warn(`[Proxy Loop Blocked] Rejected recursive request to self: ${host}:${port}`);
      return {
        response: {
          statusCode: 400,
          header: { 'content-type': 'text/plain' },
          body: 'Bad Request: Recursive proxy loop to self is blocked.'
        }
      };
    }

    console.log(`[${proto.toUpperCase()}] ${method} ${proto}://${host}${pathStr}`);

    // 1. Run all active external rules in order
    const activeRules = rulesManager.getActiveExternalRules();
    for (const item of activeRules) {
      if (item.module && item.module.beforeSendRequest) {
        try {
          const extReq = yield item.module.beforeSendRequest(requestDetail);
          if (extReq) {
            console.log(`[ExternalRule Applied: ${item.name}] Modified request -> ${proto}://${host}${pathStr}`);
            return extReq;
          }
        } catch (err) {
          console.error(`[ExternalRule ${item.name} beforeSendRequest Error]:`, err.message || err);
        }
      }
    }

    // 2. Run Composer UI rewrite rules
    const modified = rulesManager.modifyRequest(requestDetail);
    if (modified) {
      return modified;
    }

    return null;
  },

  // Log and optionally modify incoming responses
  *beforeSendResponse(requestDetail, responseDetail) {
    const statusCode = responseDetail.response.statusCode;
    const host = (requestDetail.requestOptions && requestDetail.requestOptions.hostname) || '';
    const pathStr = (requestDetail.requestOptions && requestDetail.requestOptions.path) || '';
    console.log(`[RESP ${statusCode}] ${host}${pathStr}`);

    // 1. Run all active external rules in order
    const activeRules = rulesManager.getActiveExternalRules();
    for (const item of activeRules) {
      if (item.module && item.module.beforeSendResponse) {
        try {
          const extRes = yield item.module.beforeSendResponse(requestDetail, responseDetail);
          if (extRes) {
            console.log(`[ExternalRule Applied: ${item.name}] Modified response for -> ${requestDetail.url}`);
            return extRes;
          }
        } catch (err) {
          console.error(`[ExternalRule ${item.name} beforeSendResponse Error]:`, err.message || err);
        }
      }
    }

    // 2. Run Composer UI rewrite rules
    const modified = rulesManager.modifyResponse(requestDetail, responseDetail);
    if (modified) {
      return modified;
    }

    return null;
  },

  // Log SSL handshake / connection errors
  *onConnectError(requestDetail, error) {
    console.error(`[SSL Connect Error] Host: ${requestDetail.host} - Error: ${error.message || error}`);
    return null;
  },

  *onError(requestDetail, error) {
    console.error(`[Request Error] ${error.message || error}`);
    return null;
  }
};
