import express from 'express';
import {
  getCommunicationSettings,
  updateCommunicationSettings,
  upsertChannelProvider,
  deleteChannelProvider
} from '../controllers/communicationSettingsController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getCommunicationSettings)
  .put(protect, updateCommunicationSettings);

router.route('/providers')
  .post(protect, upsertChannelProvider);

router.route('/providers/:id')
  .delete(protect, deleteChannelProvider);

export default router;
