import SchoolFeatureOverride from '../models/SchoolFeatureOverride.js';
import School from '../models/School.js';
import { ALL_FEATURE_CODES, STARTER_FEATURES } from '../config/featureRegistry.js';

// Core communication features that must never be restricted
export const COMMUNICATION_FEATURES = [
  'announcements',
  'notifications',
  'push-notifications',
  'sms',
  'email-automation',
  'whatsapp',
  'bulk-messaging',
  'automated-alerts'
];

// Core features every school gets regardless of plan (basic access)
const DEFAULT_FEATURES = [
  ...STARTER_FEATURES,
  'student-app', 'teacher-app', 'parent-app',
];

const getBasePlanFeatures = (school) => {
  const plan = school?.subscription?.plan;
  const planFeatures = plan?.features || [];
  const schoolEnabledModules = school?.settings?.enabledModules || [];

  if (planFeatures.includes('ALL_MODULES')) {
    return ALL_FEATURE_CODES;
  }

  if (planFeatures.length > 0) {
    return planFeatures;
  }

  if (schoolEnabledModules.includes('ALL_MODULES')) {
    return ALL_FEATURE_CODES;
  }

  if (schoolEnabledModules.length > 0) {
    return schoolEnabledModules;
  }

  // SECURITY: No plan and no enabled modules -> return starter defaults, NOT everything
  return DEFAULT_FEATURES;
};

export const getPlanFeaturesForSchool = async (schoolId) => {
  const school = await School.findById(schoolId).populate('subscription.plan');
  if (!school) return [...COMMUNICATION_FEATURES];
  
  const baseFeatures = getBasePlanFeatures(school);
  return [...new Set([...baseFeatures, ...COMMUNICATION_FEATURES])];
};

export const isFeatureEnabled = async (schoolId, featureKey) => {
  if (COMMUNICATION_FEATURES.includes(featureKey)) {
    return true;
  }
  
  if (!schoolId || !featureKey) {
    return false;
  }

  const school = await School.findById(schoolId).populate('subscription.plan');
  if (!school) {
    return false;
  }

  const baseFeatures = getBasePlanFeatures(school);
  const planAllowsFeature = baseFeatures.includes(featureKey);
  
  if (!planAllowsFeature) return false;

  const override = await SchoolFeatureOverride.findOne({
    school: schoolId,
    featureKey
  });

  return override ? override.isEnabled === true : true;
};

export const getEnabledFeaturesForSchool = async (schoolId) => {
  const school = await School.findById(schoolId).populate('subscription.plan');
  if (!school) return [...COMMUNICATION_FEATURES];

  const overrides = await SchoolFeatureOverride.find({ school: schoolId });
  const overrideMap = new Map();
  overrides.forEach(ov => overrideMap.set(ov.featureKey, ov.isEnabled));

  const baseFeatures = getBasePlanFeatures(school);
  const allFeatures = [...new Set([...baseFeatures, ...COMMUNICATION_FEATURES])];
  
  return allFeatures.filter(featureKey => {
    const override = overrideMap.get(featureKey);
    return override === undefined ? true : override === true;
  });
};
