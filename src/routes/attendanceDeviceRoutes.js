import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import injectAcademicYear from '../middlewares/injectAcademicYear.js';
import checkModuleAccess from '../middlewares/featureMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import {
  getDevices, getDevice, registerDevice, updateDevice,
  deleteDevice, regenerateCredentials, deviceHeartbeat, getDeviceStats,
} from '../controllers/attendanceDeviceController.js';

const router = Router();
router.use(protect, injectAcademicYear);
router.use(checkModuleAccess('attendance'));

router.get('/stats', asyncHandler(getDeviceStats));
router.get('/', asyncHandler(getDevices));
router.get('/:id', asyncHandler(getDevice));
router.post('/', asyncHandler(registerDevice));
router.put('/:id', asyncHandler(updateDevice));
router.delete('/:id', asyncHandler(deleteDevice));
router.post('/:id/regenerate-credentials', asyncHandler(regenerateCredentials));
router.post('/heartbeat', asyncHandler(deviceHeartbeat));

export default router;
