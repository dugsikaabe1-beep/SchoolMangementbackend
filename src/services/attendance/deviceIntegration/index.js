/**
 * Device Integration Service Factory
 *
 * Usage:
 *   import { createDeviceService } from './deviceIntegration/index.js';
 *   const svc = createDeviceService(deviceDocument);
 *   await svc.connect();
 *   await svc.authenticate();
 *   const logs = await svc.pullLogs(since);
 */
import ZKTecoService from './ZKTecoService.js';
import HikvisionService from './HikvisionService.js';
import RFIDService from './RFIDService.js';
import NFCService from './NFCService.js';
import FaceRecognitionService from './FaceRecognitionService.js';
import BaseDeviceService from './BaseDeviceService.js';

const SERVICE_MAP = {
  QR_SCANNER:         BaseDeviceService,   // QR is browser-based; no hardware service needed
  RFID_READER:        RFIDService,
  NFC_READER:         NFCService,
  FACE_SCANNER:       FaceRecognitionService,
  FINGERPRINT_SCANNER: ZKTecoService,      // ZKTeco is the most common fingerprint terminal vendor
  HYBRID:             ZKTecoService,       // Hybrid devices typically use ZKTeco SDK
};

/**
 * Brand-specific overrides: if the device brand is known, pick the right service.
 */
const BRAND_MAP = {
  zkteco:             ZKTecoService,
  hikvision:          HikvisionService,
  'hik vision':       HikvisionService,
};

/**
 * Create a device integration service for the given AttendanceDevice document.
 *
 * @param {Object} device — Mongoose AttendanceDevice document
 * @param {Object} options — { onAttendance, onDisconnect, logger }
 * @returns {BaseDeviceService}
 */
export function createDeviceService(device, options = {}) {
  // Brand override takes priority
  const brand = (device.brand || '').toLowerCase().trim();
  const BrandService = BRAND_MAP[brand];

  if (BrandService) {
    return new BrandService(device, options);
  }

  // Fall back to device type mapping
  const TypeService = SERVICE_MAP[device.deviceType] || BaseDeviceService;
  return new TypeService(device, options);
}

export {
  BaseDeviceService,
  ZKTecoService,
  HikvisionService,
  RFIDService,
  NFCService,
  FaceRecognitionService,
};
