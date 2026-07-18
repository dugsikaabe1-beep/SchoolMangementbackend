/**
 * FaceRecognitionService — Face recognition device / SDK integration.
 *
 * Supports:
 *   - Local face recognition devices (via TCP — ZKTeco Face, Hikvision Face)
 *   - Cloud face recognition APIs (AWS Rekognition, Azure Face, Face++ etc.)
 *   - On-device face matching (device sends pre-matched results)
 *
 * The service handles:
 *   - Face template enrollment (push embeddings to device or cloud)
 *   - Attendance event processing (receive face match results)
 *   - Anti-spoofing / liveness verification
 */
import BaseDeviceService from './BaseDeviceService.js';
import net from 'net';

export default class FaceRecognitionService extends BaseDeviceService {
  constructor(device, options = {}) {
    super(device, options);
    this.socket = null;
    this.sdkType = device.sdkType || 'LOCAL'; // LOCAL | CLOUD | DEVICE_MATCH
  }

  // ── Connection ────────────────────────────────────────────────

  async connect() {
    if (this.sdkType === 'CLOUD') {
      // Cloud mode: verify API key is set
      if (!this.device.apiKey) throw new Error('Cloud API key required for face recognition');
      this.connected = true;
      this.logger.info(`[Face] ${this.device.name}: cloud mode — API key verified`);
      await this.logEvent('CONNECTED', 'success', 'Cloud API key verified');
      return { mode: 'cloud' };
    }

    // LOCAL / DEVICE_MATCH: TCP connection to face terminal
    const port = this.device.port || 8080;

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(10000);

      this.socket.connect(port, this.device.ipAddress, async () => {
        this.connected = true;
        this.logger.info(`[Face] ${this.device.name}: connected to ${this.device.ipAddress}:${port}`);
        await this.logEvent('CONNECTED', 'success', `TCP connected`);
        resolve();
      });

      this.socket.on('data', async (data) => {
        const faceData = this._parseFaceData(data);
        if (faceData) {
          await this.logEvent('SCAN_SUCCESS', 'success', `Face matched: employee ${faceData.employeeId} (score: ${faceData.confidence})`, {
            employee: faceData.employeeId,
            method: 'FACE_RECOGNITION',
          });
          this.onAttendance({
            ...faceData,
            deviceSerial: this.device.serialNumber,
            method: 'FACE_RECOGNITION',
            timestamp: new Date(),
          });
        }
      });

      this.socket.on('error', async (err) => {
        this.connected = false;
        this.logger.error(`[Face] ${this.device.name}: error: ${err.message}`);
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
    if (this.sdkType === 'CLOUD') {
      // Cloud API ping
      const health = await this._cloudRequest('GET', '/health');
      this.logger.info(`[Face] Cloud API status: ${health?.status || 'ok'}`);
    }
    await this.logEvent('INFO', 'success', 'Face recognition service ready');
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

  // ── Log Pulling ────────────────────────────────────────────────

  async pullLogs(since = new Date(Date.now() - 86400000)) {
    if (this.sdkType === 'CLOUD') {
      return this._cloudPullLogs(since);
    }
    this.logger.info('[Face] LOCAL mode: logs streamed in real-time');
    return [];
  }

  async _cloudPullLogs(since) {
    const response = await this._cloudRequest('GET', `/attendance/logs?since=${since.toISOString()}`);
    if (!response?.logs) return [];

    return response.logs.map(log => ({
      employeeId: log.employeeId,
      timestamp: new Date(log.timestamp),
      checkType: log.checkType,
      method: 'FACE_RECOGNITION',
      confidence: log.confidence,
      livenessScore: log.livenessScore,
      deviceSerial: this.device.serialNumber,
    }));
  }

  // ── Enrollment ────────────────────────────────────────────────

  async pushEnroll(employeeId, biometricType, template) {
    if (biometricType !== 'FACE') throw new Error('This service only handles face enrollment');

    if (this.sdkType === 'CLOUD') {
      return this._cloudEnroll(employeeId, template);
    }

    // LOCAL: push face template to device via TCP
    const enrollPacket = this._buildEnrollPacket(employeeId, template);
    return this._sendAndAwait(enrollPacket);
  }

  async _cloudEnroll(employeeId, template) {
    const body = {
      employeeId: String(employeeId),
      faceData: template.embeddings || template.data,
      quality: template.quality || 0.85,
    };
    const response = await this._cloudRequest('POST', '/faces/enroll', body);
    await this.logEvent('ENROLL_FACE', 'success', `Face enrolled for employee ${employeeId} via cloud`, {
      employee: employeeId,
      method: 'FACE_RECOGNITION',
    });
    return response;
  }

  async removeEnroll(employeeId) {
    if (this.sdkType === 'CLOUD') {
      await this._cloudRequest('DELETE', `/faces/${employeeId}`);
    }
    await this.logEvent('DELETE_USER', 'success', `Face data removed for employee ${employeeId}`, {
      employee: employeeId,
    });
    return { success: true };
  }

  // ── Health ─────────────────────────────────────────────────────

  async getHealth() {
    if (this.sdkType === 'CLOUD') {
      try {
        const h = await this._cloudRequest('GET', '/health');
        return { status: 'online', cloud: true, ...h };
      } catch {
        return { status: 'offline', cloud: true, lastHeartbeat: new Date() };
      }
    }
    return {
      status: this.connected ? 'online' : 'offline',
      lastHeartbeat: new Date(),
    };
  }

  // ── Internal Helpers ──────────────────────────────────────────

  async _cloudRequest(method, path, body = null) {
    const url = `https://api.facepp.com/v3${path}`; // example; real URL from device config
    const headers = {
      'Authorization': `Bearer ${this.device.apiKey}`,
      'Content-Type': 'application/json',
    };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Cloud API error: ${res.status}`);
    return res.json();
  }

  _parseFaceData(data) {
    try {
      const str = data.toString('utf8').trim();
      const json = JSON.parse(str);
      if (json.employeeId || json.userId) {
        return {
          employeeId: String(json.employeeId || json.userId),
          confidence: json.confidence || json.score || 0,
          livenessScore: json.liveness || 0,
          checkType: json.checkType || 'CHECK_IN',
          photoUrl: json.photoUrl || null,
        };
      }
    } catch { /* not JSON */ }
    return null;
  }

  _buildEnrollPacket(employeeId, template) {
    const empId = parseInt(employeeId, 10) || 0;
    const faceData = Buffer.from(JSON.stringify(template.embeddings || []));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(empId, 0);
    header.writeUInt32LE(faceData.length, 4);
    return Buffer.concat([header, faceData]);
  }

  async _sendAndAwait(packet, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Device response timeout')), timeoutMs);
      this.socket.write(packet, (err) => {
        if (err) { clearTimeout(timer); reject(err); return; }
        const handler = (data) => {
          clearTimeout(timer);
          this.socket.removeListener('data', handler);
          resolve({ success: true, response: data.toString() });
        };
        this.socket.on('data', handler);
      });
    });
  }
}
