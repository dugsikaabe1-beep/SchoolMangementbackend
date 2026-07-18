import express from 'express';
import {
  getAttendanceRules,
  updateAttendanceRules,
  addHoliday,
  removeHoliday,
} from '../controllers/attendanceRuleController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(checkModuleAccess('attendance'));

router.get('/', getAttendanceRules);
router.put('/', updateAttendanceRules);
router.post('/holidays', addHoliday);
router.delete('/holidays/:holidayId', removeHoliday);

export default router;
