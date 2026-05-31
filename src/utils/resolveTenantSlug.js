/**
 * Resolve tenant slug for Cloudinary folder isolation.
 */
export function resolveTenantSlug(req) {
  const fromReq = req.tenantId || req.tenantSubdomain;
  if (fromReq && typeof fromReq === 'string') {
    return sanitizeFolderSegment(fromReq);
  }

  if (req.school?.subdomain) {
    return sanitizeFolderSegment(req.school.subdomain);
  }

  const school = req.user?.school;
  if (school && typeof school === 'object' && school.subdomain) {
    return sanitizeFolderSegment(school.subdomain);
  }

  return 'platform';
}

export function sanitizeFolderSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'unknown';
}
