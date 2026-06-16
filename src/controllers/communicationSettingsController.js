import School from '../models/School.js';
import ChannelProvider from '../models/ChannelProvider.js';
import asyncHandler from 'express-async-handler';
import { encryptConfig, decryptConfig } from '../utils/crypto.js';
import { logAction } from '../utils/auditLogger.js';

// @desc    Get communication settings for current school
// @route   GET /api/admin/communication-settings
// @access  Private (School Admin/Super Admin)
export const getCommunicationSettings = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  if (!schoolId) {
    res.status(400);
    throw new Error('School not found for user');
  }

  // Get school with settings
  const school = await School.findById(schoolId).select('settings');
  
  // Get channel providers for this school
  const channelProviders = await ChannelProvider.find({ schoolId, isActive: true });
  
  // Decrypt configs
  const providers = channelProviders.map(provider => {
    const providerObj = provider.toObject();
    try {
      if (providerObj.config && typeof providerObj.config === 'string') {
        providerObj.config = decryptConfig(providerObj.config);
      }
    } catch (e) {
      console.warn('[CommunicationSettings] Failed to decrypt provider config:', e.message);
    }
    return providerObj;
  });

  res.json({
    settings: school?.settings || {},
    providers
  });
});

// @desc    Update school communication settings
// @route   PUT /api/admin/communication-settings
// @access  Private (School Admin/Super Admin)
export const updateCommunicationSettings = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  if (!schoolId) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const { settings } = req.body;

  const school = await School.findById(schoolId);
  if (!school) {
    res.status(404);
    throw new Error('School not found');
  }

  // Update school settings
  school.settings = { ...school.settings, ...settings };
  await school.save();

  await logAction(req.user._id, {
    action: 'UPDATE_COMMUNICATION_SETTINGS',
    module: 'COMMUNICATION',
    targetId: school._id,
    details: {}
  });

  res.json({ message: 'Communication settings updated successfully', settings: school.settings });
});

// @desc    Add or update a channel provider
// @route   POST /api/admin/communication-settings/providers
// @access  Private (School Admin/Super Admin)
export const upsertChannelProvider = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  if (!schoolId) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const { providerKey, providerType, config, isActive } = req.body;

  if (!providerKey || !providerType) {
    res.status(400);
    throw new Error('Provider key and type are required');
  }

  // Encrypt the config
  let encryptedConfig = config;
  if (config && typeof config === 'object') {
    encryptedConfig = encryptConfig(config);
  }

  // Find existing or create new
  let provider = await ChannelProvider.findOne({ schoolId, providerKey });
  
  if (provider) {
    // Update existing
    provider.providerType = providerType;
    if (encryptedConfig) provider.config = encryptedConfig;
    if (isActive !== undefined) provider.isActive = isActive;
  } else {
    // Create new
    provider = await ChannelProvider.create({
      tenantId: schoolId,
      schoolId,
      providerKey,
      providerType,
      config: encryptedConfig,
      isActive: isActive !== undefined ? isActive : true
    });
  }

  await provider.save();

  await logAction(req.user._id, {
    action: 'UPSERT_CHANNEL_PROVIDER',
    module: 'COMMUNICATION',
    targetId: provider._id,
    details: { providerKey, providerType }
  });

  res.status(200).json({ message: 'Channel provider saved successfully', provider });
});

// @desc    Delete a channel provider
// @route   DELETE /api/admin/communication-settings/providers/:id
// @access  Private (School Admin/Super Admin)
export const deleteChannelProvider = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  if (!schoolId) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const provider = await ChannelProvider.findOneAndDelete({
    _id: req.params.id,
    schoolId
  });

  if (!provider) {
    res.status(404);
    throw new Error('Channel provider not found');
  }

  await logAction(req.user._id, {
    action: 'DELETE_CHANNEL_PROVIDER',
    module: 'COMMUNICATION',
    targetId: provider._id,
    details: { providerKey: provider.providerKey }
  });

  res.json({ message: 'Channel provider deleted successfully' });
});
