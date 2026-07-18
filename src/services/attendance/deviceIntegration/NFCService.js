/**
 * NFCService — NFC reader integration.
 *
 * NFC readers typically connect via:
 *   - Serial/USB (via node-serialport or node-hid)
 *   - TCP (network-attached NFC readers)
 *   - HTTP webhook (reader posts to our endpoint)
 *
 * This service focuses on TCP/webhook modes.  For serial/USB NFC readers,
 * the frontend WebNFC API (already implemented in StaffAttendance.jsx)
 * handles direct browser-based NFC reading.
 */
import BaseDeviceService from './BaseDeviceService.js';
import net from 'net';

export default class NFCService extends BaseDeviceService {
  constructor(device, options = {}) {
    super(device, options);
    this.socket = null;
    this._nfcBuffer = Buffer.alloc(0);
  }

  // ── TCP Connection ────────────────────────────────────────────

  async connect() {
    const port = this.device.port || 5000;

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(10000);

      this.socket.connect(port, this.device.ipAddress, async () => {
        this.connected = true;
        this.logger.info(`[NFC] ${this.device.name}: connected to ${this.device.ipAddress}:${port}`);
        await this.logEvent('CONNECTED', 'success', `TCP connected`);
        resolve();
      });

      this.socket.on('data', async (data) => {
        const nfcData = this._parseNFCData(data);
        if (nfcData) {
          await this.logEvent('SCAN_SUCCESS', 'success', `NFC tag read: ${nfcData.uid}`, {
            method: 'NFC',
          });
          this.onAttendance({
            ...nfcData,
            deviceSerial: this.device.serialNumber,
            timestamp: new Date(),
          });
        }
      });

      this.socket.on('error', async (err) => {
        this.connected = false;
        this.logger.error(`[NFC] ${this.device.name}: error: ${err.message}`);
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
    await this.logEvent('INFO', 'success', 'NFC reader ready');
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
    this.logger.info('[NFC] pullLogs: push-mode reader, no stored logs');
    return [];
  }

  async pushEnroll(employeeId, biometricType, template) {
    // NFC enrollment is tag assignment
    this.logger.info(`[NFC] Tag assignment for ${employeeId}: ${template.uid}`);
    await this.logEvent('ENROLL_NFC', 'success', `NFC tag assigned to employee ${employeeId}: ${template.uid}`, {
      employee: employeeId,
      method: 'NFC',
    });
    return { success: true, uid: template.uid };
  }

  async removeEnroll(employeeId, biometricType) {
    await this.logEvent('DELETE_USER', 'success', `NFC access removed for employee ${employeeId}`, {
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

  _parseNFCData(data) {
    const str = data.toString('utf8').trim();

    // Try JSON
    try {
      const json = JSON.parse(str);
      if (json.uid) return { uid: json.uid.toUpperCase(), type: json.type };
    } catch { /* not JSON */ }

    // Try hex UID
    if (/^[0-9A-Fa-f]{8,20}$/.test(str)) {
      return { uid: str.toUpperCase(), type: 'NDEF' };
    }

    // NTAG/Ultralight UID: first 4 bytes are manufacturer ID
    if (data.length >= 7) {
      const uid = Array.from(data.slice(0, 7)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      return { uid, type: 'ISO14443A' };
    }

    return null;
  }
}
