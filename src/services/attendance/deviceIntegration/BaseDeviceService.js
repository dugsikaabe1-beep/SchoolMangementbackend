/**
 * BaseDeviceService — Abstract base class for all hardware device integrations.
 *
 * Every device vendor (ZKTeco, Hikvision, etc.) extends this class and
 * implements the abstract methods.  The attendance engine only talks to
 * this interface — it never touches vendor SDKs directly.
 *
 * Lifecycle:
 *   1. connect()      → establish TCP/HTTP/WebSocket link
 *   2. authenticate() → handshake / API key exchange
 *   3. pullLogs()     → fetch attendance logs from device
 *   4. pushEnroll()   → push biometric template to device
 *   5. disconnect()   → clean up
 */
import AttendanceDeviceLog from '../../models/AttendanceDeviceLog.js';

export default class BaseDeviceService {
  /**
   * @param {Object} device  — AttendanceDevice document
   * @param {Object} options — { logger, onAttendance, onDisconnect }
   */
  constructor(device, options = {}) {
    this.device = device;
    this.logger = options.logger || console;
    this.onAttendance = options.onAttendance || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.connected = false;
    this._reconnectTimer = null;
  }

  // ── Abstract methods (must override) ──────────────────────────────

  /** Establish connection to the hardware device. */
  async connect()    { throw new Error('connect() not implemented'); }

  /** Authenticate / handshake with the device. */
  async authenticate() { throw new Error('authenticate() not implemented'); }

  /** Pull attendance logs since `since` date. Returns Array<{ employeeId, timestamp, method }> */
  async pullLogs(since) { throw new Error('pullLogs() not implemented'); }

  /** Push a biometric template to the device for enrollment. */
  async pushEnroll(employeeId, biometricType, template) { throw new Error('pushEnroll() not implemented'); }

  /** Remove an employee's template from the device. */
  async removeEnroll(employeeId, biometricType) { throw new Error('removeEnroll() not implemented'); }

  /** Gracefully disconnect. */
  async disconnect() { throw new Error('disconnect() not implemented'); }

  /** Return device health info (CPU, memory, uptime, etc.) */
  async getHealth()  { return {}; }

  // ── Shared helpers ────────────────────────────────────────────────

  /**
   * Log a device event to AttendanceDeviceLog.
   */
  async logEvent(action, status, message, meta = {}) {
    try {
      await AttendanceDeviceLog.create({
        device:    this.device._id,
        school:    this.device.school,
        branch:    this.device.branch,
        action,
        status,
        message,
        employee:  meta.employee,
        method:    meta.method,
        ipAddress: this.device.ipAddress,
        errorCode: meta.errorCode,
        meta:      meta.extra,
        timestamp: new Date(),
      });
    } catch (err) {
      this.logger.error(`[DeviceLog] Failed to write log: ${err.message}`);
    }
  }

  /**
   * Start auto-reconnect with exponential backoff.
   */
  startReconnect(maxRetries = 10, baseDelayMs = 5000) {
    let attempt = 0;
    const reconnect = async () => {
      if (attempt >= maxRetries) {
        this.logger.warn(`[Device] ${this.device.name}: max reconnect attempts reached`);
        await this.logEvent('CONNECTION_FAILED', 'failure', `Max reconnect attempts (${maxRetries}) reached`);
        return;
      }
      attempt++;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 300000); // cap 5 min
      this.logger.info(`[Device] ${this.device.name}: reconnect attempt ${attempt} in ${delay}ms`);
      setTimeout(async () => {
        try {
          await this.connect();
          await this.authenticate();
          this.connected = true;
          this.logger.info(`[Device] ${this.device.name}: reconnected`);
          await this.logEvent('CONNECTED', 'success', `Reconnected after ${attempt} attempts`);
        } catch {
          reconnect();
        }
      }, delay);
    };
    reconnect();
  }

  /**
   * Stop auto-reconnect.
   */
  stopReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
