const dgram = require('node:dgram');
const os = require('node:os');

const BROADCAST_PORT = 41234;
const BROADCAST_INTERVAL_MS = 2000;

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, ifaceList] of Object.entries(interfaces)) {
    // Skip virtual switches like Hyper-V (vEthernet), VMware, VirtualBox, WSL
    const isVirtual = /vEthernet|virtual|vmware|vbox|wsl/i.test(name);

    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({
          name,
          address: iface.address,
          isVirtual,
          isLan192: iface.address.startsWith('192.168.'),
          isLan10: iface.address.startsWith('10.')
        });
      }
    }
  }

  // 1. Prioritize real physical LAN (192.168.x.x or 10.x.x.x)
  const physicalLan = candidates.find(c => !c.isVirtual && (c.isLan192 || c.isLan10));
  if (physicalLan) return physicalLan.address;

  // 2. Any non-virtual interface
  const anyPhysical = candidates.find(c => !c.isVirtual);
  if (anyPhysical) return anyPhysical.address;

  // 3. Any available non-internal interface
  if (candidates.length > 0) return candidates[0].address;

  return '127.0.0.1';
}

class UdpDiscoveryService {
  constructor(httpPort = 3000) {
    this.httpPort = httpPort;
    this.server = null;
    this.intervalId = null;
    this.localIp = getLocalIpAddress();
    this.hostname = os.hostname();
    this.activeSessionCode = 'PHONG-01';
  }

  setSessionCode(code) {
    this.activeSessionCode = code;
  }

  start() {
    try {
      this.server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.server.on('error', (err) => {
        console.error('[UDP Beacon] Error:', err.message);
      });

      this.server.on('listening', () => {
        try {
          this.server.setBroadcast(true);
        } catch (e) {
          console.warn('[UDP Beacon] Could not set broadcast flag:', e.message);
        }
        const address = this.server.address();
        console.log(`[UDP Beacon] Broadcasting server presence on UDP port ${address.port} every ${BROADCAST_INTERVAL_MS / 1000}s`);
        console.log(`[UDP Beacon] Server LAN IP: http://${this.localIp}:${this.httpPort}`);
      });

      // Handle direct ping from client requesting server info
      this.server.on('message', (msg, rinfo) => {
        const text = msg.toString().trim();
        if (text === 'DISCOVER_LAN_EXAM_SERVER') {
          const response = Buffer.from(JSON.stringify(this.getBeaconPayload()));
          this.server.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
            if (!err) {
              console.log(`[UDP Beacon] Responded to discovery probe from ${rinfo.address}:${rinfo.port}`);
            }
          });
        }
      });

      this.server.bind(0, () => {
        this.intervalId = setInterval(() => {
          this.broadcast();
        }, BROADCAST_INTERVAL_MS);
        this.broadcast();
      });
    } catch (err) {
      console.error('[UDP Beacon] Failed to start UDP service:', err.message);
    }
  }

  getBeaconPayload() {
    return {
      service: 'LAN_EXAM_SERVER',
      version: '1.0.0',
      hostname: this.hostname,
      ip: this.localIp,
      port: this.httpPort,
      url: `http://${this.localIp}:${this.httpPort}`,
      activeSessionCode: this.activeSessionCode,
      timestamp: Date.now()
    };
  }

  broadcast() {
    if (!this.server) return;
    const payload = JSON.stringify(this.getBeaconPayload());
    const message = Buffer.from(payload);

    this.server.send(message, 0, message.length, BROADCAST_PORT, '255.255.255.255', (err) => {
      if (err && err.code !== 'ENETUNREACH') {
        // Suppress benign network unreachable errors if WiFi/LAN is momentarily disconnected
      }
    });
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.server) {
      try {
        this.server.close();
      } catch (e) {}
    }
  }
}

module.exports = {
  UdpDiscoveryService,
  getLocalIpAddress
};
