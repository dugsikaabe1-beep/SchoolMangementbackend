/**
 * RFIDService — Generic RFID reader integration.
 *
 * Supports common RFID reader protocols:
 *   - Wiegand (via TCP gateway)
 *   - OSDP (Open Supervised Device Protocol)
 *   - HTTP webhook mode (reader POSTs card scans to our API)
 *
 * For USB RFID readers that work as keyboard input (HID mode),
 * no server-side integration is needed — the frontend handles input.
 */
import BaseDeviceService from './BaseDeviceService.js';
import net from 'net';

export default class RFIDService extends BaseDeviceService {
  constructor(device, options = {}) {
    super(device, options);
    this.socket = null;
    this._scanBuffer = '';
  }

  // ── TCP Connection (Wiegand gateway / OSDP) ───────────────────

  async connect() {
    const port = this.device.port || 4000; // common Wiegand gateway port

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(10000);

      this.socket.connect(port, this.device.ipAddress, async () => {
        this.connected = true;
        this.logger.info(`[RFID] ${this.device.name}: connected to ${this.device.ipAddress}:${port}`);
        await this.logEvent('CONNECTED', 'success', `TCP connected to ${this.device.ipAddress}:${port}`);
        resolve();
      });

      this.socket.on('data', async (data) => {
        const cardData = this._parseData(data);
        if (cardData) {
          await this.logEvent('SCAN_SUCCESS', 'success', `Card scanned: ${cardData.uid}`, {
            method: 'RFID',
          });
          this.onAttendance({
            ...cardData,
            deviceSerial: this.device.serialNumber,
            timestamp: new Date(),
          });
        }
      });

      this.socket.on('error', async (err) => {
        this.connected = false;
        this.logger.error(`[RFID] ${this.device.name}: error: ${err.message}`);
        await this.logEvent('CONNECTION_FAILED', 'failure', err.message);
        reject(err);
      });

      this.socket.on('close', async () => {
        this.connected = false;
        this.onDisconnect();
        await this.logEvent('DISCONNECTED', 'info', 'Socket closed');
      });
    });
  }

  async authenticate() {
    // OSDP handshake if applicable
    if (this.device.sdkType === 'OSDP') {
      const pdid = Buffer.from([0x00, 0x82]); // PDID command
      return this._sendPacket(pdid);
    }
    await this.logEvent('INFO', 'success', 'RFID reader ready (Wiegand/HID mode)');
    return true;
  }

  async disconnect() {
    this.stopReconnect();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    await this.logEvent('DISCONNECTED', 'info', 'Graceful disconnect');
  }

  async pullLogs(since) {
    // RFID readers in push mode don't store logs — they stream
    // For readers with onboard storage, implement vendor-specific pull
    this.logger.info('[RFID] pullLogs: push-mode reader, no stored logs');
    return [];
  }

  async pushEnroll(employeeId, biometricType, template) {
    // RFID enrollment is card assignment (done on User.verificationData)
    // Some readers support card whitelist push
    this.logger.info(`[RFID] Card assignment for ${employeeId}: ${template.uid}`);
    await this.logEvent('ENROLL_RFID', 'success', `RFID card assigned to employee ${employeeId}: ${template.uid}`, {
      employee: employeeId,
      method: 'RFID',
    });
    return { success: true, uid: template.uid };
  }

  async removeEnroll(employeeId, biometricType) {
    await this.logEvent('DELETE_USER', 'success', `RFID access removed for employee ${employeeId}`, {
      employee: employeeId,
    });
    return { success: true };
  }

  async getHealth() {
    return {
      status: this.connected ? 'online' : 'offline',
      lastHeartbeat: new Date(),
    };
  }

  // ── Internal Helpers ──────────────────────────────────────────

  _parseData(data) {
    // Common RFID reader output formats:
    // 1. Hex string: "AABBCCDD\r\n"
    // 2. Wiegand: raw binary data
    // 3. JSON: {"uid": "AABBCCDD", "facility": 1}

    const str = data.toString('utf8').trim();

    // Try JSON first
    try {
      const json = JSON.parse(str);
      if (json.uid) return { uid: json.uid, facility: json.facility, cardNumber: json.cardNumber };
    } catch { /* not JSON */ }

    // Try hex string (most common)
    if (/^[0-9A-Fa-f]+$/.test(str)) {
      return { uid: str.toUpperCase(), cardNumber: str };
    }

    // Wiegand: extract facility code + card number from raw bytes
    if (data.length === 4) {
      const bits = data.readUInt32BE(0);
      const facilityCode = (bits >> 17) & 0x7FFF;
      const cardNumber = bits & 0x1FFFF;
      return {
        uid: `${facilityCode.toString(16).toUpperCase().padStart(4, '0')}${cardNumber.toString(16).toUpperCase().padStart(6, '0')}`,
        facilityCode,
        cardNumber,
      };
    }

    return null; // unrecognized format
  }

  _sendPacket(data) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      this.socket.write(data, (err) => err ? reject(err) : resolve());
    });
  }
}
