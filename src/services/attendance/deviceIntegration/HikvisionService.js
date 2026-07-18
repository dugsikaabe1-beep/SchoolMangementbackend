/**
 * HikvisionService — Integration with Hikvision attendance terminals.
 *
 * Hikvision devices expose an ISAPI (Internet Surveillance API) interface
 * over HTTP/HTTPS.  This service uses the ISAPI endpoints for:
 *   - Attendance log retrieval (GET /ISAPI/AccessControl/AttendanceRecord)
 *   - Face template management (PUT /ISAPI/Intelligent/FaceDetection)
 *   - Device status monitoring
 *
 * Reference: Hikvision ISAPI Developer Guide v3.4
 */
import BaseDeviceService from './BaseDeviceService.js';

export default class HikvisionService extends BaseDeviceService {
  constructor(device, options = {}) {
    super(device, options);
    this.baseUrl = `http://${device.ipAddress}${device.port ? `:${device.port}` : ''}`;
    this.authHeader = null;
  }

  // ── Connection ────────────────────────────────────────────────

  async connect() {
    // Hikvision ISAPI uses HTTP Basic Auth (digest auth for some models)
    const username = this.device.apiKey || 'admin';
    const password = this.device.secret || '';
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    try {
      // Test connection with device info endpoint
      const response = await this._request('GET', '/ISAPI/System/deviceInfo');
      this.connected = true;
      this.logger.info(`[Hikvision] ${this.device.name}: connected — ${response?.deviceInfo?.model || 'unknown model'}`);
      await this.logEvent('CONNECTED', 'success', `ISAPI connected — model: ${response?.deviceInfo?.model || 'unknown'}`);
      return response;
    } catch (err) {
      this.connected = false;
      await this.logEvent('CONNECTION_FAILED', 'failure', err.message);
      throw err;
    }
  }

  async authenticate() {
    // Connection test IS the authentication for Hikvision ISAPI
    if (!this.connected) await this.connect();
    await this.logEvent('INFO', 'success', 'ISAPI authentication verified');
    return true;
  }

  async disconnect() {
    this.stopReconnect();
    this.connected = false;
    this.authHeader = null;
    await this.logEvent('DISCONNECTED', 'info', 'Graceful disconnect');
  }

  // ── Log Pulling ────────────────────────────────────────────────

  async pullLogs(since = new Date(Date.now() - 86400000)) {
    if (!this.connected) throw new Error('Device not connected');

    const startTime = since.toISOString().replace(/\.\d{3}Z$/, '');
    const endTime = new Date().toISOString().replace(/\.\d{3}Z$/, '');

    const url = `/ISAPI/AccessControl/AttendanceRecord?startTime=${startTime}&endTime=${endTime}`;
    const response = await this._request('GET', url);

    if (!response?.AttendanceRecord) return [];

    return response.AttendanceRecord.map(record => ({
      employeeId: record.employeeNoString || record.employeeNo,
      timestamp: new Date(record.time),
      checkType: record.checkType === 'checkIn' ? 'CHECK_IN' : 'CHECK_OUT',
      method: this._mapVerifyMode(record.verifyMode),
      deviceSerial: this.device.serialNumber,
      readerId: record.readerId,
      photoPath: record.facePhoto || null,
    }));
  }

  // ── Face Enrollment ────────────────────────────────────────────

  async pushEnroll(employeeId, biometricType, template) {
    if (!this.connected) throw new Error('Device not connected');

    if (biometricType === 'FACE') {
      return this._enrollFace(employeeId, template);
    }
    if (biometricType === 'FINGERPRINT') {
      return this._enrollFingerprint(employeeId, template);
    }
    throw new Error(`Hikvision does not support biometric type: ${biometricType}`);
  }

  async _enrollFace(employeeId, template) {
    // Hikvision face enrollment via ISAPI
    const url = '/ISAPI/Intelligent/FaceDetection';
    const body = {
      FaceDetectionRect: {
        employeeNoString: String(employeeId),
        faceData: template.faceData || template.data,
      },
    };

    const response = await this._request('PUT', url, body);
    await this.logEvent('ENROLL_FACE', 'success', `Face enrolled for employee ${employeeId}`, {
      employee: employeeId,
      method: 'FACE_RECOGNITION',
    });
    return response;
  }

  async _enrollFingerprint(employeeId, template) {
    // Hikvision fingerprint enrollment
    const url = '/ISAPI/AccessControl/Fingerprint/Upload';
    const body = {
      Fingerprint: {
        employeeNoString: String(employeeId),
        fingerNo: template.fingerIndex || 0,
        fingerType: template.fingerType || 'normal',
        fingerprintData: template.data || template.templateRef,
      },
    };

    const response = await this._request('PUT', url, body);
    await this.logEvent('ENROLL_FINGERPRINT', 'success', `Fingerprint enrolled for employee ${employeeId}`, {
      employee: employeeId,
      method: 'FINGERPRINT',
    });
    return response;
  }

  async removeEnroll(employeeId, biometricType) {
    if (!this.connected) throw new Error('Device not connected');

    const url = `/ISAPI/AccessControl/Fingerprint/Delete`;
    const body = {
      Fingerprint: {
        employeeNoString: String(employeeId),
        fingerNo: 0xFF, // 0xFF = all fingers
      },
    };

    const response = await this._request('PUT', url, body);
    await this.logEvent('DELETE_USER', 'success', `Removed employee ${employeeId} from device`, {
      employee: employeeId,
    });
    return response;
  }

  // ── Health ─────────────────────────────────────────────────────

  async getHealth() {
    try {
      const info = await this._request('GET', '/ISAPI/System/deviceInfo');
      return {
        status: 'online',
        model: info?.deviceInfo?.model,
        serialNumber: info?.deviceInfo?.serialNumber,
        firmware: info?.deviceInfo?.firmwareVersion,
        lastHeartbeat: new Date(),
      };
    } catch {
      return { status: 'offline', lastHeartbeat: new Date() };
    }
  }

  // ── Internal Helpers ──────────────────────────────────────────

  async _request(method, path, body = null, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const opts = {
        method,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(`${this.baseUrl}${path}`, opts);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) return res.json();
      return { raw: await res.text() };
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Request timeout');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  _mapVerifyMode(mode) {
    const map = {
      1: 'PASSWORD',
      2: 'FINGERPRINT',
      3: 'FACE_RECOGNITION',
      4: 'RFID',
      5: 'NFC',
    };
    return map[mode] || 'MANUAL';
  }
}
