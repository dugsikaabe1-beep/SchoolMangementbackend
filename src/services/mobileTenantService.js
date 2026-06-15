import Branch from '../models/Branch.js';
import School from '../models/School.js';
import SchoolEvent from '../models/SchoolEvent.js';
import SchoolHome from '../models/SchoolHome.js';
import { getEnabledFeaturesForSchool } from '../utils/featureAccess.js';

const DEFAULT_BRANDING = {
  primaryColor: '#0A84FF',
  secondaryColor: '#00C7BE',
  accentColor: '#FF9500',
  backgroundColor: '#F5F7FA',
  textColor: '#1D1D1F',
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['Trial', 'Active', 'Expiring Soon']);

const logMobileTenant = (step, details = {}) => {
  console.log('[MobileTenant]', {
    step,
    tenantId: details.tenantId || null,
    branchId: details.branchId || null,
    path: details.path || null,
    controller: details.controller || 'mobileTenantController.getMobileTenantConfig',
    service: 'mobileTenantService.getTenantConfig',
    query: details.query || null,
    result: details.result || null,
  });
};

const isSubscriptionActive = (school) => {
  if (school.subscription?.blockedByAdmin) return false;
  if (school.subscription?.status && !ACTIVE_SUBSCRIPTION_STATUSES.has(school.subscription.status)) {
    return false;
  }
  if (school.subscription?.endDate && new Date() > new Date(school.subscription.endDate)) {
    return false;
  }
  return true;
};

export const getTenantConfig = async ({ tenantId, branchId, path }) => {
  logMobileTenant('school.query', {
    tenantId,
    branchId,
    path,
    query: { model: 'School', filter: { subdomain: tenantId } },
  });

  const school = await School.findOne({ subdomain: tenantId })
    .select('name subdomain logo code motto settings status isActive subscription email phone website address city country schoolType description')
    .lean();

  if (!school) {
    logMobileTenant('school.not_found', { tenantId, branchId, path, result: 'not_found' });
    return { status: 404, error: 'School not found' };
  }

  if (!school.isActive || school.status !== 'active') {
    logMobileTenant('school.inactive', { tenantId, branchId, path, result: school.status });
    return { status: 403, error: 'School inactive' };
  }

  if (!isSubscriptionActive(school)) {
    logMobileTenant('subscription.inactive', {
      tenantId,
      branchId,
      path,
      result: school.subscription?.status || 'expired_or_blocked',
    });
    return { status: 403, error: 'School subscription is not active' };
  }

  const branchFilter = { tenant: school._id, status: 'active', isDeleted: { $ne: true } };
  logMobileTenant('branches.query', {
    tenantId,
    branchId,
    path,
    query: { model: 'Branch', filter: branchFilter },
  });

  const branches = await Branch.find(branchFilter)
    .select('name code phone email address city country logo status')
    .sort({ createdAt: 1 })
    .lean();

  const activeBranch =
    branches.find((branch) => branchId && String(branch._id) === String(branchId)) ||
    branches[0] ||
    null;

  if (branchId && !activeBranch) {
    logMobileTenant('branch.not_found', { tenantId, branchId, path, result: 'not_found_or_inactive' });
    return { status: 404, error: 'Branch not found or inactive' };
  }

  const contentBranchId = activeBranch?._id;
  const contentFilter = contentBranchId
    ? { school: school._id, branch: contentBranchId }
    : { school: school._id };

  logMobileTenant('content.query', {
    tenantId,
    branchId: contentBranchId,
    path,
    query: { models: ['SchoolHome', 'SchoolEvent', 'SchoolFeatureOverride'], filter: contentFilter },
  });

  const [home, events, enabledFeatures] = await Promise.all([
    SchoolHome.findOne(contentFilter).lean(),
    SchoolEvent.find(contentFilter).sort({ date: 1 }).limit(20).lean(),
    getEnabledFeaturesForSchool(school._id),
  ]);

  const notices = [];
  if (home?.welcomeText) notices.push({ id: 'welcome', title: 'Welcome', body: home.welcomeText, date: new Date().toISOString() });
  if (home?.motto || school.motto) notices.push({ id: 'motto', title: 'School Motto', body: home?.motto || school.motto, date: new Date().toISOString() });

  logMobileTenant('config.ready', {
    tenantId,
    branchId: contentBranchId,
    path,
    result: { schoolId: school._id, branches: branches.length, events: events.length, features: enabledFeatures.length },
  });

  return {
    status: 200,
    data: {
      type: 'school',
      _id: school._id,
      tenantId: school.subdomain,
      subdomain: school.subdomain,
      name: school.name,
      logo: activeBranch?.logo || school.logo,
      code: school.code,
      isActive: school.isActive,
      enabledFeatures,
      features: enabledFeatures,
      ...DEFAULT_BRANDING,
      school: {
        _id: school._id,
        name: school.name,
        subdomain: school.subdomain,
        code: school.code,
        logo: school.logo,
        isActive: school.isActive,
        status: school.status,
      },
      tenant: {
        id: school.subdomain,
        tenantId: school.subdomain,
        schoolId: school._id,
      },
      branch: activeBranch,
      branches,
      theme: DEFAULT_BRANDING,
      settings: school.settings || {},
      subscription: {
        status: school.subscription?.status,
        endDate: school.subscription?.endDate,
        active: true,
      },
      home: home || {
        heroTitle: `Welcome to ${school.name}`,
        heroSubtitle: 'Providing quality education',
      },
      events,
      notices,
    },
  };
};
