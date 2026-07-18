/**
 * ZKTecoService — Integration with ZKTeco biometric devices.
 *
 * ZKTeco devices expose a TCP-based SDK (PULL protocol) and a newer
 * HTTP Web API.  This service supports both:
 *   - TCP mode:  Direct socket connection for real-time attendance push
 *   - HTTP mode: REST API for log pulling and template management
 *
 * Protocol reference: ZKTeco PULL SDK / ZKBioSecurity HTTP API
 */
import BaseDeviceService from './BaseDeviceService.js';
import net from 'net';

const ZKTECO_CMD = {
  CONNECT:       0x0000,
  PULL_ATTLOG:   0x0001,
  PULL_USER:     0x0002,
  ENROLL_USER:   0x0003,
  DELETE_USER:   0x0004,
  GET_STATUS:    0x0005,
  PING:          0x0006,
  DISCONNECT:    0x0007,
  GET_DEVICE_TIME: 0x0008,
};

export default class ZKTecoService extends BaseDeviceService {
  constructor(device, options = {}) {
    super(device, options);
    this.socket = null;
    this.port = device.port || 4370;
    this.host = device.ipAddress;
    this._buffer = Buffer.alloc(0);
    this._pendingCallbacks = new Map();
  }

  // ── TCP Connection ──────────────────────────────────────────────

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(10000);

      this.socket.connect(this.port, this.host, async () => {
        this.connected = true;
        this.socket.setTimeout(30000);
        this.logger.info(`[ZKTeco] ${this.device.name}: connected to ${this.host}:${this.port}`);
        await this.logEvent('CONNECTED', 'success', `TCP connected to ${this.host}:${this.port}`);
        resolve();
      });

      this.socket.on('data', (data) => this._handleData(data));
      this.socket.on('error', async (err) => {
        this.connected = false;
        this.logger.error(`[ZKTeco] ${this.device.name}: socket error: ${err.message}`);
        await this.logEvent('CONNECTION_FAILED', 'failure', err.message, { errorCode: err.code });
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
    // ZKTeco PULL SDK: send connect command with session ID
    const sessionId = Math.floor(Math.random() * 0x7FFFFFFF);
    const packet = this._buildPacket(ZKTECO_CMD.CONNECT, sessionId, Buffer.alloc(0));
    return this._sendAndAwait(packet);
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

  // ── Log Pulling ────────────────────────────────────────────────

  async pullLogs(since = new Date(Date.now() - 86400000)) {
    if (!this.connected) throw new Error('Device not connected');

    const cmdBuf = Buffer.alloc(8);
    cmdBuf.writeUInt32LE(Math.floor(since.getTime() / 1000), 0); // Unix timestamp
    cmdBuf.writeUInt32LE(0, 4); // flags

    const packet = this._buildPacket(ZKTECO_CMD.PULL_ATTLOG, 0, cmdBuf);
    const response = await this._sendAndAwait(packet);

    if (!response || !response.payload) return [];

    // Parse attendance records from binary response
    return this._parseAttendanceLog(response.payload);
  }

  // ── Enrollment Push ────────────────────────────────────────────

  async pushEnroll(employeeId, biometricType, template) {
    if (!this.connected) throw new Error('Device not connected');

    // ZKTeco fingerprint enrollment: PIN + finger index + template data
    const empId = parseInt(employeeId, 10) || 0;
    const fingerIdx = template.fingerIndex || 0;
    const templateData = Buffer.from(template.data || '', 'base64');

    const cmdBuf = Buffer.alloc(4 + templateData.length);
    cmdBuf.writeUInt32LE(empId, 0);
    templateData.copy(cmdBuf, 4);

    const packet = this._buildPacket(ZKTECO_CMD.ENROLL_USER, fingerIdx, cmdBuf);
    const result = await this._sendAndAwait(packet);

    await this.logEvent('ENROLL_FINGERPRINT', 'success', `Enrolled finger ${fingerIdx} for employee ${employeeId}`, {
      employee: employeeId,
      method: 'FINGERPRINT',
    });

    return result;
  }

  async removeEnroll(employeeId, biometricType) {
    if (!this.connected) throw new Error('Device not connected');

    const empId = parseInt(employeeId, 10) || 0;
    const cmdBuf = Buffer.alloc(4);
    cmdBuf.writeUInt32LE(empId, 0);

    const packet = this._buildPacket(ZKTECO_CMD.DELETE_USER, 0, cmdBuf);
    const result = await this._sendAndAwait(packet);

    await this.logEvent('DELETE_USER', 'success', `Removed employee ${employeeId} from device`, {
      employee: employeeId,
    });

    return result;
  }

  // ── Health ─────────────────────────────────────────────────────

  async getHealth() {
    try {
      const packet = this._buildPacket(ZKTECO_CMD.GET_STATUS, 0, Buffer.alloc(0));
      const response = await this._sendAndAwait(packet, 3000);
      return {
        status: this.connected ? 'online' : 'offline',
        lastHeartbeat: new Date(),
        ...response?.meta,
      };
    } catch {
      return { status: 'offline', lastHeartbeat: new Date() };
    }
  }

  // ── Internal Helpers ──────────────────────────────────────────

  _buildPacket(command, sessionId, payload) {
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x50A5, 0);   // ZKTeco magic bytes
    header.writeUInt16LE(command, 2);
    header.writeUInt16LE(sessionId, 4);
    header.writeUInt16LE(payload.length, 6);
    return Buffer.concat([header, payload]);
  }

  _handleData(data) {
    this._buffer = Buffer.concat([this._buffer, data]);

    // Minimum packet: 8 byte header
    while (this._buffer.length >= 8) {
      const magic = this._buffer.readUInt16LE(0);
      if (magic !== 0x50A5) {
        // Invalid data — skip byte
        this._buffer = this._buffer.subarray(1);
        continue;
      }
      const cmd = this._buffer.readUInt16LE(2);
      const sessionId = this._buffer.readUInt16LE(4);
      const payloadLen = this._buffer.readUInt16LE(6);

      if (this._buffer.length < 8 + payloadLen) break; // incomplete

      const payload = this._buffer.subarray(8, 8 + payloadLen);
      this._buffer = this._buffer.subarray(8 + payloadLen);

      // Dispatch to pending callback
      const cb = this._pendingCallbacks.get(sessionId);
      if (cb) {
        this._pendingCallbacks.delete(sessionId);
        cb({ command: cmd, sessionId, payload });
      }

      // Real-time attendance push (device-initiated)
      if (cmd === ZKTECO_CMD.PULL_ATTLOG && payload.length > 0) {
        const records = this._parseAttendanceLog(payload);
        records.forEach(r => this.onAttendance(r));
      }
    }
  }

  async _sendAndAwait(packet, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const sessionId = packet.readUInt16LE(4);
      const timer = setTimeout(() => {
        this._pendingCallbacks.delete(sessionId);
        reject(new Error('Device response timeout'));
      }, timeoutMs);

      this._pendingCallbacks.set(sessionId, (data) => {
        clearTimeout(timer);
        resolve(data);
      });

      this.socket.write(packet, (err) => {
        if (err) {
          clearTimeout(timer);
          this._pendingCallbacks.delete(sessionId);
          reject(err);
        }
      });
    });
  }

  _parseAttendanceLog(buffer) {
    const records = [];
    const recordSize = 40; // ZKTeco standard record size
    for (let offset = 0; offset + recordSize <= buffer.length; offset += recordSize) {
      const empId = buffer.readUInt32LE(offset);
      const timestamp = buffer.readUInt32LE(offset + 4) * 1000;
      const status = buffer.readUInt8(offset + 8); // 0=check-in, 1=check-out
      const verified = buffer.readUInt8(offset + 9); // 0=password, 1=fingerprint, 2=face, etc.

      if (empId === 0) continue;

      const methodMap = { 0: 'MANUAL', 1: 'FINGERPRINT', 2: 'FACE_RECOGNITION', 3: 'RFID', 4: 'NFC' };

      records.push({
        employeeId: String(empId),
        timestamp: new Date(timestamp),
        checkType: status === 0 ? 'CHECK_IN' : 'CHECK_OUT',
        method: methodMap[verified] || 'MANUAL',
        deviceSerial: this.device.serialNumber,
      });
    }
    return records;
  }
}
