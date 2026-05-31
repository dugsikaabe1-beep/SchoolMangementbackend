import asyncHandler from 'express-async-handler';
import School from '../models/School.js';
import SchoolHome from '../models/SchoolHome.js';
import SchoolEvent from '../models/SchoolEvent.js';
import { isValidSubdomainLabel } from '../utils/securityUtils.js';

const DEFAULT_BRANDING = {
  primaryColor: '#0A84FF',
  secondaryColor: '#00C7BE',
  accentColor: '#FF9500',
  backgroundColor: '#F5F7FA',
  textColor: '#1D1D1F',
};

/**
 * @desc    Mobile app tenant config (branding + public preview)
 * @route   GET /api/mobile/tenant/config/:tenantId
 * @access  Public
 */
export const getMobileTenantConfig = asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId || '')
    .trim()
    .toLowerCase();

  if (!tenantId || tenantId === 'default' || !isValidSubdomainLabel(tenantId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid tenant id',
      userMessage: 'School tenant id is missing or invalid.',
    });
  }

  const school = await School.findOne({ subdomain: tenantId, isActive: true }).lean();

  if (!school) {
    return res.status(404).json({
      success: false,
      message: 'School not found',
      userMessage: 'The school you are trying to access does not exist or is inactive.',
    });
  }

  const [home, events] = await Promise.all([
    SchoolHome.findOne({ school: school._id }).lean(),
    SchoolEvent.find({ school: school._id }).sort({ date: 1 }).limit(20).lean(),
  ]);

  const notices = [];
  if (home?.welcomeText) {
    notices.push({
      id: 'welcome',
      title: 'Welcome',
      body: home.welcomeText,
      date: new Date().toISOString(),
    });
  }
  if (home?.motto) {
    notices.push({
      id: 'motto',
      title: 'School Motto',
      body: home.motto,
      date: new Date().toISOString(),
    });
  }

  res.json({
    type: 'school',
    _id: school._id,
    tenantId: school.subdomain,
    subdomain: school.subdomain,
    name: school.name,
    logo: school.logo,
    code: school.code,
    isActive: school.isActive,
    ...DEFAULT_BRANDING,
    home: home || {
      heroTitle: `Welcome to ${school.name}`,
      heroSubtitle: 'Providing quality education',
    },
    events: events || [],
    notices,
  });
});
