/**
 * Prints every school with stable identifiers for tenants and ops.
 * Run from backend root: npm run list-schools
 * Options: --json   (machine-readable)
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const jsonOut = process.argv.includes('--json');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const School = (await import('../src/models/School.js')).default;

  const list = await School.find({})
    .sort({ name: 1 })
    .select('name subdomain _id isActive status code email')
    .lean();

  const root = (process.env.ROOT_DOMAIN || '').trim();

  const rows = list.map((s) => ({
    name: s.name,
    tenantId: s.subdomain,
    schoolId: String(s._id),
    isActive: s.isActive,
    status: s.status,
    code: s.code || '',
    email: s.email || '',
    suggestedUrl: root ? `https://${s.subdomain}.${root}` : '',
  }));

  if (jsonOut) {
    console.log(JSON.stringify(rows, null, 2));
    await mongoose.disconnect();
    return;
  }

  console.log('\nSchools ↔ tenant map (tenantId = subdomain used in Host / JWT)\n');
  console.log(
    ['name', 'tenantId', 'schoolId', 'active', 'status', 'suggestedUrl']
      .map((h) => h.padEnd(14))
      .join('')
  );
  console.log('-'.repeat(120));
  for (const r of rows) {
    const line = [
      String(r.name).slice(0, 40),
      r.tenantId,
      r.schoolId,
      String(r.isActive),
      r.status || '',
      r.suggestedUrl || '(set ROOT_DOMAIN for URLs)',
    ]
      .map((c, i) => String(c).padEnd(i === 0 ? 42 : 14))
      .join('');
    console.log(line);
  }
  console.log(`\nTotal: ${rows.length} school(s).`);
  if (!root) {
    console.log('Tip: set ROOT_DOMAIN in .env to print suggested school URLs.\n');
  } else {
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
