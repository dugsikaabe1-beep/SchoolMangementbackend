import mongoose from 'mongoose';

/**
 * Generate a URL-friendly slug from a school name.
 * Lowercases, replaces spaces with hyphens, strips non-alphanumeric chars.
 */
function baseSlug(name) {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique subdomain for a school.
 * Uses incrementing numeric suffix (-2, -3, …) on collision.
 * Excludes the document being updated (for name-change scenarios).
 */
export async function generateUniqueSubdomain(name, excludeId = null) {
  const slug = baseSlug(name);
  if (!slug) throw new Error('Cannot generate subdomain from the provided name');

  const School = mongoose.model('School');

  // Check if the base slug is already taken
  const query = { subdomain: slug };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await School.exists(query);
  if (!existing) return slug;

  // Increment: -2, -3, -4 …
  let counter = 2;
  while (true) {
    const candidate = `${slug}-${counter}`;
    const q = { subdomain: candidate };
    if (excludeId) q._id = { $ne: excludeId };

    const taken = await School.exists(q);
    if (!taken) return candidate;
    counter++;
  }
}
