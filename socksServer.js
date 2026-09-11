'use strict';

const net = require('net');
const ipWhitelistManager = require('./ipWhitelistManager');

/**
 * Creates and starts a SOCKS4/4a/5 proxy server with IP Whitelist protection.
 * 
 * @param {Object} options
 * @param {number} options.port - SOCKS listen port (default 1080)
 * @param {string} [options.host] - Listen host (default '0.0.0.0')
 * @returns {net.Server}
 */
function createSocksServer(options = {}) {
  const port = options.port || parseInt(process.env.SOCKS_PORT || '1080', 10);
  const host = options.host || '0.0.0.0';

  const server = net.createServer({ pauseOnConnect: false }, (clientSocket) => {
    const rawIp = clientSocket.remoteAddress;
    const clientIp = ipWhitelistManager.cleanIp(rawIp);

    // 1. Check IP Whitelist
    if (!ipWhitelistManager.isIpAllowed(clientIp)) {
      console.warn(`[SOCKS Security] Blocked unauthorized IP on port ${port}: ${clientIp}`);
      clientSocket.destroy();
      return;
    }

    let proto = null; // 'SOCKS5' or 'SOCKS4'
    let state = 'INIT';
    let buffer = Buffer.alloc(0);
    let targetSocket = null;

    clientSocket.on('error', (err) => {
      if (targetSocket && !targetSocket.destroyed) {
        targetSocket.destroy();
      }
    });

    clientSocket.on('data', onData);

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);

      // Detect protocol version
      if (state === 'INIT') {
        if (buffer.length < 2) return;
        const ver = buffer[0];

        if (ver === 0x05) {
          proto = 'SOCKS5';
          state = 'SOCKS5_AUTH';
        } else if (ver === 0x04) {
          proto = 'SOCKS4';
          state = 'SOCKS4_REQUEST';
        } else {
          console.warn(`[SOCKS] Unknown protocol version: 0x${ver.toString(16)} from ${clientIp}`);
          clientSocket.destroy();
          return;
        }
      }

      // SOCKS5 Handshake
      if (state === 'SOCKS5_AUTH') {
        const nmethods = buffer[1];
        if (buffer.length < 2 + nmethods) return;

        // Reply: Version 5, Method 0x00 (NO AUTH REQUIRED)
        clientSocket.write(Buffer.from([0x05, 0x00]));

        buffer = buffer.slice(2 + nmethods);
        state = 'SOCKS5_REQUEST';

        if (buffer.length > 0) {
          onData(Buffer.alloc(0));
        }
        return;
      }

      // SOCKS5 Request
      if (state === 'SOCKS5_REQUEST') {
        if (buffer.length < 4) return;

        const ver = buffer[0];
        const cmd = buffer[1];
        const atyp = buffer[3];

        if (ver !== 0x05) {
          clientSocket.destroy();
          return;
        }

        if (cmd !== 0x01) {
          // 0x07: Command not supported
          clientSocket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          clientSocket.destroy();
          return;
        }

        let targetHost = '';
        let targetPort = 0;
        let reqLen = 0;

        if (atyp === 0x01) {
          // IPv4
          if (buffer.length < 10) return;
          targetHost = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;
          targetPort = buffer.readUInt16BE(8);
          reqLen = 10;
        } else if (atyp === 0x03) {
          // Domain name
          const domainLen = buffer[4];
          if (buffer.length < 5 + domainLen + 2) return;
          targetHost = buffer.toString('utf8', 5, 5 + domainLen);
          targetPort = buffer.readUInt16BE(5 + domainLen);
          reqLen = 5 + domainLen + 2;
        } else if (atyp === 0x04) {
          // IPv6: 16 bytes
          if (buffer.length < 22) return;
          const ipv6Bytes = buffer.slice(4, 20);

          // 1. Cloudflare 2606:4700::/32 embeds IPv4 in the lowest 32 bits
          if (ipv6Bytes[0] === 0x26 && ipv6Bytes[1] === 0x06 && ipv6Bytes[2] === 0x47 && ipv6Bytes[3] === 0x00) {
            targetHost = `${ipv6Bytes[12]}.${ipv6Bytes[13]}.${ipv6Bytes[14]}.${ipv6Bytes[15]}`;
            console.log(`[SOCKS5 IPv6->IPv4] Auto translated Cloudflare IPv6 to IPv4 -> ${targetHost}`);
          }
          // 2. IPv4-mapped IPv6 (::ffff:w.x.y.z)
          else if (ipv6Bytes.slice(0, 10).every(b => b === 0) && ipv6Bytes[10] === 0xff && ipv6Bytes[11] === 0xff) {
            targetHost = `${ipv6Bytes[12]}.${ipv6Bytes[13]}.${ipv6Bytes[14]}.${ipv6Bytes[15]}`;
            console.log(`[SOCKS5 IPv6->IPv4] Translated ::ffff: IPv6 to IPv4 -> ${targetHost}`);
          }
          // 3. NAT64 prefix (64:ff9b::/96)
          else if (ipv6Bytes[0] === 0x00 && ipv6Bytes[1] === 0x64 && ipv6Bytes[2] === 0xff && ipv6Bytes[3] === 0x9b && ipv6Bytes.slice(4, 12).every(b => b === 0)) {
            targetHost = `${ipv6Bytes[12]}.${ipv6Bytes[13]}.${ipv6Bytes[14]}.${ipv6Bytes[15]}`;
            console.log(`[SOCKS5 IPv6->IPv4] Translated NAT64 IPv6 to IPv4 -> ${targetHost}`);
          } else {
            const parts = [];
            for (let i = 0; i < 16; i += 2) {
              parts.push(buffer.readUInt16BE(4 + i).toString(16));
            }
            targetHost = parts.join(':');
          }
          targetPort = buffer.readUInt16BE(20);
          reqLen = 22;
        } else {
          // 0x08: Address type not supported
          clientSocket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          clientSocket.destroy();
          return;
        }

        state = 'PIPING';
        clientSocket.removeListener('data', onData);

        const leftover = buffer.slice(reqLen);
        buffer = null;

        connectAndPipe(targetHost, targetPort, 'SOCKS5', leftover);
        return;
      }

      // SOCKS4 / SOCKS4a Request
      if (state === 'SOCKS4_REQUEST') {
        if (buffer.length < 9) return;
        const cmd = buffer[1];
        if (cmd !== 0x01) {
          // 0x5b: rejected
          clientSocket.write(Buffer.from([0x00, 0x5b, 0, 0, 0, 0, 0, 0]));
          clientSocket.destroy();
          return;
        }

        const targetPort = buffer.readUInt16BE(2);
        const isSocks4a = (buffer[4] === 0 && buffer[5] === 0 && buffer[6] === 0 && buffer[7] !== 0);

        // Find end of null-terminated USERID
        const nullIndex = buffer.indexOf(0x00, 8);
        if (nullIndex === -1) return;

        let targetHost = '';
        let reqLen = 0;

        if (isSocks4a) {
          // SOCKS4a: Domain follows USERID
          const domainNullIndex = buffer.indexOf(0x00, nullIndex + 1);
          if (domainNullIndex === -1) return;
          targetHost = buffer.toString('utf8', nullIndex + 1, domainNullIndex);
          reqLen = domainNullIndex + 1;
        } else {
          targetHost = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;
          reqLen = nullIndex + 1;
        }

        state = 'PIPING';
        clientSocket.removeListener('data', onData);

        const leftover = buffer.slice(reqLen);
        buffer = null;

        connectAndPipe(targetHost, targetPort, 'SOCKS4', leftover);
        return;
      }
    }

    function connectAndPipe(targetHost, targetPort, type, leftover) {
      console.log(`[${type} CONNECT] ${clientIp} -> ${targetHost}:${targetPort}`);

      targetSocket = net.connect({ host: targetHost, port: targetPort }, () => {
        if (type === 'SOCKS5') {
          // SOCKS5 Succeeded (0x00)
          clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]), () => {
            if (leftover && leftover.length > 0) targetSocket.write(leftover);
            clientSocket.pipe(targetSocket);
            targetSocket.pipe(clientSocket);
          });
        } else {
          // SOCKS4 Succeeded (0x5a)
          clientSocket.write(Buffer.from([0x00, 0x5a, 0, 0, 0, 0, 0, 0]), () => {
            if (leftover && leftover.length > 0) targetSocket.write(leftover);
            clientSocket.pipe(targetSocket);
            targetSocket.pipe(clientSocket);
          });
        }
      });

      targetSocket.on('error', (err) => {
        console.error(`[${type} Error] ${targetHost}:${targetPort} - ${err.message}`);
        if (!clientSocket.destroyed) {
          try {
            if (type === 'SOCKS5') {
              clientSocket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            } else {
              clientSocket.write(Buffer.from([0x00, 0x5b, 0, 0, 0, 0, 0, 0]));
            }
          } catch (e) {}
          clientSocket.destroy();
        }
      });

      targetSocket.on('close', () => {
        if (!clientSocket.destroyed) {
          clientSocket.destroy();
        }
      });
    }
  });

  server.on('error', (err) => {
    console.error(`[SOCKS Server Error on port ${port}]:`, err.message || err);
  });

  return server;
}

module.exports = {
  createSocksServer
};
