import SchoolFeatureOverride from '../models/SchoolFeatureOverride.js';
import School from '../models/School.js';
import { ALL_FEATURE_CODES } from '../config/featureRegistry.js';

// List of all communication features that must never be restricted
const COMMUNICATION_FEATURES = [
  'announcements',
  'notifications',
  'push-notifications',
  'sms',
  'email-automation',
  'whatsapp',
  'bulk-messaging',
  'automated-alerts'
];

const getBasePlanFeatures = (school) => {
  const plan = school?.subscription?.plan;
  const planFeatures = plan?.features || [];
  const schoolEnabledModules = school?.settings?.enabledModules || [];

  console.log('[getBasePlanFeatures] school:', school?.name);
  console.log('[getBasePlanFeatures] plan:', plan?.name, 'planFeatures:', planFeatures);
  console.log('[getBasePlanFeatures] schoolEnabledModules:', schoolEnabledModules);

  if (planFeatures.includes('ALL_MODULES')) {
    console.log('[getBasePlanFeatures] returning ALL_FEATURE_CODES');
    return ALL_FEATURE_CODES;
  }

  if (planFeatures.length > 0) {
    console.log('[getBasePlanFeatures] returning planFeatures');
    return planFeatures;
  }

  if (schoolEnabledModules.includes('ALL_MODULES')) {
    console.log('[getBasePlanFeatures] returning ALL_FEATURE_CODES (from school modules)');
    return ALL_FEATURE_CODES;
  }

  if (schoolEnabledModules.length > 0) {
    console.log('[getBasePlanFeatures] returning schoolEnabledModules');
    return schoolEnabledModules;
  }

  console.log('[getBasePlanFeatures] returning default ALL_FEATURE_CODES');
  return ALL_FEATURE_CODES;
};

export const getPlanFeaturesForSchool = async (schoolId) => {
  const school = await School.findById(schoolId).populate('subscription.plan');
  if (!school) return [];
  
  // Get base plan features and add communication features if missing
  const baseFeatures = getBasePlanFeatures(school);
  const allFeatures = [...new Set([...baseFeatures, ...COMMUNICATION_FEATURES])];
  
  return allFeatures;
};

export const isFeatureEnabled = async (schoolId, featureKey) => {
  console.log(`[isFeatureEnabled] checking feature: ${featureKey} for school: ${schoolId}`);
  
  // Always allow communication features
  if (COMMUNICATION_FEATURES.includes(featureKey)) {
    console.log(`[isFeatureEnabled] ${featureKey} is a core communication feature - always enabled`);
    return true;
  }
  
  if (!schoolId || !featureKey) {
    console.log(`[isFeatureEnabled] missing schoolId or featureKey`);
    return false;
  }

  const school = await School.findById(schoolId).populate('subscription.plan');
  if (!school) {
    console.log(`[isFeatureEnabled] school not found`);
    return false;
  }

  const baseFeatures = getBasePlanFeatures(school);
  console.log(`[isFeatureEnabled] baseFeatures:`, baseFeatures);
  const planAllowsFeature = baseFeatures.includes(featureKey);
  console.log(`[isFeatureEnabled] planAllowsFeature: ${planAllowsFeature}`);
  
  if (!planAllowsFeature) return false;

  const override = await SchoolFeatureOverride.findOne({
    school: schoolId,
    featureKey
  });
  console.log(`[isFeatureEnabled] override:`, override);

  const result = override ? override.isEnabled === true : true;
  console.log(`[isFeatureEnabled] result: ${result}`);
  return result;
};

export const getEnabledFeaturesForSchool = async (schoolId) => {
  const school = await School.findById(schoolId).populate('subscription.plan');
  if (!school) return [];

  const overrides = await SchoolFeatureOverride.find({ school: schoolId });
  const overrideMap = new Map();
  overrides.forEach(ov => overrideMap.set(ov.featureKey, ov.isEnabled));

  // Get base features and add communication features if missing
  const baseFeatures = getBasePlanFeatures(school);
  const allFeatures = [...new Set([...baseFeatures, ...COMMUNICATION_FEATURES])];
  
  return allFeatures.filter(featureKey => {
    const override = overrideMap.get(featureKey);
    return override === undefined ? true : override === true;
  });
};
