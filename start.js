'use strict';

const path = require('path');
process.env.ANYPROXY_HOME = path.resolve(__dirname, '.anyproxy');

const AnyProxy = require('anyproxy');
const ipWhitelistManager = require('./ipWhitelistManager');

const proxyPort = parseInt(process.env.PORT || '8001', 10);
const webPort = parseInt(process.env.WEB_PORT || '8002', 10);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const options = {
  port: proxyPort,
  rule: require('./rule'),
  webInterface: {
    enable: true,
    webPort: webPort
  },
  forceProxyHttps: true,
  wsIntercept: true,
  dangerouslyIgnoreUnauthorized: true,
  silent: false
};

const proxyServer = new AnyProxy.ProxyServer(options);

proxyServer.on('ready', () => {
  console.log('====================================================');
  console.log('AnyProxy is running:');
  console.log(`- HTTP/HTTPS Proxy Port : ${proxyPort}`);
  console.log(`- Web UI / Management   : http://127.0.0.1:${webPort}`);
  console.log(`- Download Root CA      : http://127.0.0.1:${webPort}/fetchCrtFile`);
  console.log(`- CA Location           : ${path.resolve(__dirname, '.anyproxy/certificates/rootCA.crt')}`);
  console.log(`- IP Whitelist (Port 8001): ${ipWhitelistManager.getWhitelistConfig().enabled ? 'ACTIVE (Protected)' : 'DISABLED (Open)'}`);
  console.log('====================================================');

  // Enforce IP Whitelist on Proxy Port 8001
  if (proxyServer.httpProxyServer) {
    proxyServer.httpProxyServer.prependListener('connection', (socket) => {
      const rawIp = socket.remoteAddress;
      const clientIp = ipWhitelistManager.cleanIp(rawIp);

      if (!ipWhitelistManager.isIpAllowed(clientIp)) {
        console.warn(`[Security Alert] Blocked unauthorized IP on port ${proxyPort}: ${clientIp}`);

        if (ipWhitelistManager.isStealthMode()) {
          socket.destroy();
        } else {
          socket.once('data', (chunk) => {
            try {
              const str = chunk.toString('utf8', 0, Math.min(chunk.length, 120));
              const isHttp = /^(GET|POST|CONNECT|PUT|DELETE|HEAD|OPTIONS|PATCH)\s/i.test(str);
              if (isHttp) {
                const bodyMsg = `403 Forbidden: AnyProxy IP Whitelist Protection.\n\nYour IP [${clientIp}] is not allowed to use proxy port ${proxyPort}.\nPlease whitelist your IP via Web Interface http://<server_ip>:${webPort}\n`;
                const response = `HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(bodyMsg, 'utf8')}\r\nConnection: close\r\n\r\n${bodyMsg}`;
                socket.write(response);
              }
            } catch (e) {}
            socket.destroy();
          });

          setTimeout(() => {
            if (!socket.destroyed) socket.destroy();
          }, 4000);
        }
      }
    });
  }
});

proxyServer.on('error', (e) => {
  console.error('AnyProxy error:', e);
});

proxyServer.start();

// Handle termination gracefully
process.on('SIGINT', () => {
  console.log('\nStopping AnyProxy...');
  proxyServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nTerminating AnyProxy...');
  proxyServer.close();
  process.exit(0);
});
