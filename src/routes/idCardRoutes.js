import express from 'express';
import {
  generateIDCard,
  getIDCards,
  getIDCardById,
  verifyIDCard,
  updateIDCardStatus,
  markAsPrinted,
  deleteIDCard,
  createIDCardDesign,
  getIDCardDesigns,
  updateIDCardDesign,
  deleteIDCardDesign,
  getIDCardPreview,
  reprintIDCard,
  getIDCardsByUser,
} from '../controllers/idCardController.js';
import { protect, allowAdmin, allowTeacher, allowParent, allowSuperAdmin } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { checkPermission } from '../middlewares/permissionMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';

const router = express.Router();

// Public route for QR verification
router.get('/verify/:token', verifyIDCard);

// Protected routes
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(asyncHandler(branchIsolation));
router.use(asyncHandler(injectAcademicYear));

// ID Card Design routes
router.get('/designs', getIDCardDesigns);
router.post('/designs', createIDCardDesign);
router.put('/designs/:id', updateIDCardDesign);
router.delete('/designs/:id', deleteIDCardDesign);

// ID Card routes
router.get('/', getIDCards);
router.get('/user/:userId', getIDCardsByUser);
router.get('/:id', getIDCardById);
router.get('/:id/preview', getIDCardPreview);
router.post('/', generateIDCard);
router.post('/:id/reprint', reprintIDCard);
router.patch('/:id/status', updateIDCardStatus);
router.patch('/:id/printed', markAsPrinted);
router.delete('/:id', deleteIDCard);

export default router;
