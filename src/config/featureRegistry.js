/**
 * Feature Registry — Single Source of Truth for all plan-controllable features.
 *
 * Every feature code used across backend middleware, frontend sidebar,
 * mobile enforcement, and Super Admin UI MUST be defined here.
 *
 * To add a new feature in the future:
 *   1. Add an entry below with code, label, and category.
 *   2. Apply checkModuleAccess('<code>') on the backend route.
 *   3. Add the feature code to sidebar nav items (feature property).
 *   4. Super Admin will see it automatically in the Plans feature matrix.
 */

export const FEATURE_REGISTRY = [
  // ── Core ──────────────────────────────────────────────────────────────
  { code: 'students',       label: 'Students',              category: 'Core' },
  { code: 'teachers',       label: 'Teachers',              category: 'Core' },
  { code: 'parents',        label: 'Parents',               category: 'Core' },
  { code: 'classes',        label: 'Classes',               category: 'Core' },
  { code: 'subjects',       label: 'Subjects',              category: 'Core' },
  { code: 'sections',       label: 'Sections',              category: 'Core' },

  // ── Academic ──────────────────────────────────────────────────────────
  { code: 'attendance',     label: 'Attendance',            category: 'Academic' },
  { code: 'schedules',      label: 'Timetable / Schedule',  category: 'Academic' },
  { code: 'academic-calendar',label: 'Academic Calendar',   category: 'Academic' },
  { code: 'exams',          label: 'Exams',                 category: 'Academic' },
  { code: 'results',        label: 'Results',               category: 'Academic' },
  { code: 'exam-halls',     label: 'Exam Halls',            category: 'Academic' },
  { code: 'certificates',   label: 'Certificates',          category: 'Academic' },
  { code: 'id-cards',       label: 'Digital ID Cards',      category: 'Academic' },
  { code: 'academic-years', label: 'Academic Years',        category: 'Academic' },
  { code: 'promotions',     label: 'Student Promotion',     category: 'Academic' },
  { code: 'admissions',     label: 'Online Admission',      category: 'Academic' },
  { code: 'automatic-timetabling', label: 'Automatic Timetabling', category: 'Academic' },

  // ── Logistics ─────────────────────────────────────────────────────────
  { code: 'hostel',         label: 'Hostel Management',     category: 'Logistics' },
  { code: 'transport',      label: 'Transport / Bus',       category: 'Logistics' },
  { code: 'library',        label: 'Library Management',    category: 'Logistics' },
  { code: 'assets',         label: 'Asset Management',      category: 'Logistics' },
  { code: 'visitors',       label: 'Visitor Management',    category: 'Logistics' },

  // ── Branch ────────────────────────────────────────────────────────────
  { code: 'branches',       label: 'Multi Branch Support',  category: 'Branch' },

  // ── Finance ───────────────────────────────────────────────────────────
  { code: 'finance',        label: 'Fees & Payments',       category: 'Finance' },
  { code: 'payment-integration', label: 'Payment Integration', category: 'Finance' },
  { code: 'invoices',       label: 'Invoices',              category: 'Finance' },
  { code: 'discounts',      label: 'Discounts',             category: 'Finance' },
  { code: 'revenue-reports',label: 'Revenue Reports',       category: 'Finance' },
  { code: 'enterprise-finance', label: 'Enterprise Finance', category: 'Finance' },
  { code: 'payroll',        label: 'Payroll Management',    category: 'Finance' },
  { code: 'procurement',    label: 'Procurement',           category: 'Finance' },
  { code: 'revenue-forecast', label: 'Revenue Forecasting', category: 'Finance' },

  // ── Communication ─────────────────────────────────────────────────────
  { code: 'announcements',     label: 'Announcements',         category: 'Communication' },
  { code: 'notifications',     label: 'In-App Notifications',  category: 'Communication' },
  { code: 'push-notifications',label: 'Push Notifications',    category: 'Communication' },
  { code: 'sms',               label: 'SMS Notifications',     category: 'Communication' },
  { code: 'email-automation',  label: 'Email Automation',      category: 'Communication' },
  { code: 'whatsapp',          label: 'WhatsApp Notifications',category: 'Communication' },
  { code: 'bulk-messaging',    label: 'Bulk Messaging',        category: 'Communication' },
  { code: 'automated-alerts',  label: 'Automated Alerts',      category: 'Communication' },

  // ── Mobile App ────────────────────────────────────────────────────────
  { code: 'parent-app',     label: 'Parent Mobile App',     category: 'Mobile App' },
  { code: 'student-app',    label: 'Student Mobile App',    category: 'Mobile App' },
  { code: 'teacher-app',    label: 'Teacher Mobile App',    category: 'Mobile App' },
  { code: 'mobile-offline', label: 'Mobile Offline Mode',   category: 'Mobile App' },

  // ── User Management ───────────────────────────────────────────────────
  { code: 'roles',          label: 'Roles',                 category: 'User Management' },
  { code: 'permissions',    label: 'Permissions',           category: 'User Management' },

  // ── School Website ────────────────────────────────────────────────────
  { code: 'website',        label: 'Website Content',       category: 'School Website' },
  { code: 'events',         label: 'School Events',         category: 'School Website' },
  { code: 'gallery',        label: 'Gallery',               category: 'School Website' },

  // ── Reports ───────────────────────────────────────────────────────────
  { code: 'academic-reports',  label: 'Academic Reports',   category: 'Reports' },
  { code: 'attendance-reports',label: 'Attendance Reports', category: 'Reports' },
  { code: 'financial-reports', label: 'Financial Reports',  category: 'Reports' },
  { code: 'student-reports',   label: 'Student Reports',    category: 'Reports' },
  { code: 'reports',           label: 'Reports',            category: 'Reports' },
  { code: 'analytics',         label: 'Feature Usage Analytics', category: 'Reports' },
  { code: 'timeline',          label: 'Activity Timeline',  category: 'Reports' },
  { code: 'business-intelligence', label: 'Business Intelligence', category: 'Reports' },
  { code: 'executive-dashboard', label: 'Executive Dashboard', category: 'Reports' },

  // ── System ────────────────────────────────────────────────────────────
  { code: 'documents',      label: 'Document Management',   category: 'System' },
  { code: 'backups',        label: 'Backup & Recovery',     category: 'System' },
  { code: 'audit-logs',     label: 'Audit Logs',            category: 'System' },
  { code: 'export',         label: 'Export Center',         category: 'System' },
  { code: 'onboarding',     label: 'Onboarding Wizard',     category: 'System' },
  { code: 'settings',       label: 'School Settings',       category: 'System' },
  { code: 'support',        label: 'Support Tickets',       category: 'System' },
  { code: 'data-recovery',  label: 'Data Recovery Center',  category: 'System' },
  { code: 'duplicate-detection', label: 'Duplicate Detection', category: 'System' },

  // ── AI & Analytics ────────────────────────────────────────────────────
  { code: 'ai-learning-assistant', label: 'AI Learning Assistant', category: 'AI & Analytics' },
  { code: 'risk-assessment',  label: 'Student Risk Assessment', category: 'AI & Analytics' },
  { code: 'ai-parent-reports', label: 'AI Parent Reports', category: 'AI & Analytics' },
  { code: 'performance-tracking', label: 'Performance Tracking', category: 'AI & Analytics' },

  // ── Student Life ──────────────────────────────────────────────────────
  { code: 'discipline',       label: 'Discipline Management', category: 'Student Life' },
  { code: 'health',           label: 'Health Records', category: 'Student Life' },
  { code: 'portfolios',       label: 'Digital Portfolios', category: 'Student Life' },
  { code: 'alumni',           label: 'Alumni Management', category: 'Student Life' },
];

/**
 * Grouped features by category — useful for Super Admin UI tabs / accordions.
 */
export const FEATURES_BY_CATEGORY = FEATURE_REGISTRY.reduce((acc, f) => {
  if (!acc[f.category]) acc[f.category] = [];
  acc[f.category].push(f);
  return acc;
}, {});

/**
 * Quick lookup: feature code → label
 */
export const FEATURE_LABEL_MAP = FEATURE_REGISTRY.reduce((acc, f) => {
  acc[f.code] = f.label;
  return acc;
}, {});

/**
 * All feature codes as a flat array.
 */
export const ALL_FEATURE_CODES = FEATURE_REGISTRY.map(f => f.code);

/**
 * Default features for Starter plan.
 */
export const STARTER_FEATURES = [
  'students', 'teachers', 'classes', 'subjects',
  'attendance', 'schedules', 'academic-years',
  'announcements', 'settings', 'support',
  // Core communication features - always included
  'notifications', 'push-notifications', 'email-automation',
  'bulk-messaging', 'automated-alerts'
];

/**
 * Default features for Professional plan.
 */
export const PROFESSIONAL_FEATURES = [
  ...STARTER_FEATURES,
  'parents', 'sections', 'exams', 'results', 'exam-halls', 'promotions',
  'finance', 'payment-integration',
  'parent-app', 'student-app', 'teacher-app',
  'roles', 'permissions', 'website', 'events',
  'academic-reports', 'attendance-reports', 'student-reports',
  'documents', 'export', 'onboarding',
  'hostel', 'transport', 'library', 'assets',
  'certificates', 'id-cards', 'admissions',
  'discounts', 'invoices', 'revenue-reports',
  'reports', 'timeline',
];

/**
 * Default features for Enterprise plan.
 */
export const ENTERPRISE_FEATURES = [
  ...PROFESSIONAL_FEATURES,
  'ai-learning-assistant', 'risk-assessment', 'ai-parent-reports', 'performance-tracking',
  'discipline', 'health', 'portfolios', 'alumni',
  'enterprise-finance', 'payroll', 'procurement', 'revenue-forecast',
  'automatic-timetabling', 'visitors',
  'mobile-offline',
  'business-intelligence', 'executive-dashboard',
  'audit-logs', 'backups', 'data-recovery', 'duplicate-detection',
  'analytics',
];

/**
 * Legacy Enterprise = ALL features.
 */
export const ENTERPRISE_LEGACY_FEATURES = ['ALL_MODULES'];
