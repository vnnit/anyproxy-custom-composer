const path = require('path');
process.env.ANYPROXY_HOME = path.resolve(__dirname, '.anyproxy');

const AnyProxy = require('anyproxy');

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
  console.log(`- HTTP/HTTPS Proxy Port: ${proxyPort}`);
  console.log(`- Web UI / Management : http://127.0.0.1:${webPort}`);
  console.log(`- Download Root CA    : http://127.0.0.1:${webPort}/fetchCrtFile`);
  console.log(`- CA Location         : ${path.resolve(__dirname, '.anyproxy/certificates/rootCA.crt')}`);
  console.log('====================================================');
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
