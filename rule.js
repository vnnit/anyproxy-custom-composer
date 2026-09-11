'use strict';

const path = require('path');
const rulesManager = require('./rulesManager');

// External rule is loaded dynamically via rulesManager.getActiveExternalRule()

module.exports = {
  summary: 'SSL Debug, Composer & Custom External Rule Handler',

  // Force intercept all HTTPS requests
  *beforeDealHttpsRequest(requestDetail) {
    console.log(`[SSL Intercept] Intercepting HTTPS -> ${requestDetail.host}`);
    return true;
  },

  // Log and optionally modify outgoing requests
  *beforeSendRequest(requestDetail) {
    const proto = requestDetail.protocol || 'http';
    const host = (requestDetail.requestOptions && requestDetail.requestOptions.hostname) || '';
    const pathStr = (requestDetail.requestOptions && requestDetail.requestOptions.path) || '';
    const method = (requestDetail.requestOptions && requestDetail.requestOptions.method) || 'GET';
    console.log(`[${proto.toUpperCase()}] ${method} ${proto}://${host}${pathStr}`);

    // 1. Run external rule if defined and active
    const extRule = rulesManager.getActiveExternalRule();
    if (extRule && extRule.beforeSendRequest) {
      try {
        const extReq = yield extRule.beforeSendRequest(requestDetail);
        if (extReq) {
          console.log(`[ExternalRule Applied] Modified request -> ${proto}://${host}${pathStr}`);
          return extReq;
        }
      } catch (err) {
        console.error('[ExternalRule beforeSendRequest Error]:', err.message || err);
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

    // 1. Run external rule if defined and active
    const extRule = rulesManager.getActiveExternalRule();
    if (extRule && extRule.beforeSendResponse) {
      try {
        const extRes = yield extRule.beforeSendResponse(requestDetail, responseDetail);
        if (extRes) {
          console.log(`[ExternalRule Applied] Modified response for -> ${requestDetail.url}`);
          return extRes;
        }
      } catch (err) {
        console.error('[ExternalRule beforeSendResponse Error]:', err.message || err);
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
