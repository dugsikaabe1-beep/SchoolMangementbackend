import SchoolFeatureOverride from '../models/SchoolFeatureOverride.js';
import School from '../models/School.js';
import Plan from '../models/Plan.js';
import { logAction } from '../utils/auditLogger.js';
import { getEnabledFeaturesForSchool, getPlanFeaturesForSchool } from '../utils/featureAccess.js';
import { ALL_FEATURE_CODES } from '../config/featureRegistry.js';
import { emitToSchool } from '../utils/socket.js';

export const getSchoolFeatures = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await School.findById(schoolId).populate('subscription.plan');
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const plan = school.subscription?.plan;
    const overrides = await SchoolFeatureOverride.find({ school: schoolId });
    const enabledFeatures = await getEnabledFeaturesForSchool(schoolId);

    res.json({
      success: true,
      data: {
        school: {
          name: school.name,
          subdomain: school.subdomain,
          enabledModules: school.settings?.enabledModules || []
        },
        plan: plan ? {
          name: plan.name,
          features: plan.features
        } : null,
        overrides,
        enabledFeatures
      }
    });
  } catch (error) {
    console.error('Get School Features Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch school features' });
  }
};

export const updateSchoolFeature = async (req, res) => {
  try {
    const { schoolId, featureKey } = req.params;
    const { isEnabled, reason = '' } = req.body;

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isEnabled must be a boolean'
      });
    }

    if (!ALL_FEATURE_CODES.includes(featureKey)) {
      return res.status(400).json({
        success: false,
        message: 'Unknown feature key'
      });
    }

    const planFeatures = await getPlanFeaturesForSchool(schoolId);
    if (isEnabled && !planFeatures.includes(featureKey)) {
      return res.status(400).json({
        success: false,
        message: 'Feature is not included in this school plan',
        userMessage: 'A school override cannot enable a feature outside the purchased plan.'
      });
    }

    // Upsert the override
    const override = await SchoolFeatureOverride.findOneAndUpdate(
      { school: schoolId, featureKey },
      {
        isEnabled,
        enabledBy: isEnabled ? req.user._id : undefined,
        updatedBy: req.user._id,
        reason: reason?.toString().trim()
      },
      { new: true, upsert: true }
    );

    logAction(req, {
      action: isEnabled ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED',
      module: 'FEATURE_MANAGEMENT',
      targetId: schoolId,
      details: {
        schoolId,
        featureKey,
        isEnabled,
        reason: reason?.toString().trim(),
        changedBy: req.user._id
      }
    });

    const enabledFeatures = await getEnabledFeaturesForSchool(schoolId);
    emitToSchool(schoolId, 'features_updated', {
      schoolId,
      featureKey,
      isEnabled,
      enabledFeatures
    });

    res.json({
      success: true,
      data: { override, enabledFeatures },
      message: `Feature ${featureKey} ${isEnabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Update School Feature Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update school feature' });
  }
};

export const resetSchoolFeatures = async (req, res) => {
  try {
    const { schoolId } = req.params;

    await SchoolFeatureOverride.deleteMany({ school: schoolId });
    const enabledFeatures = await getEnabledFeaturesForSchool(schoolId);
    emitToSchool(schoolId, 'features_updated', {
      schoolId,
      reset: true,
      enabledFeatures
    });

    logAction(req, {
      action: 'FEATURES_RESET',
      module: 'FEATURE_MANAGEMENT',
      details: { schoolId }
    });

    res.json({
      success: true,
      message: 'All feature overrides reset successfully'
    });
  } catch (error) {
    console.error('Reset School Features Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset school features' });
  }
};
