import mongoose from 'mongoose';

const migrationSchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  error: String
});

const Migration = mongoose.model('Migration', migrationSchema);

export const runMigrations = async () => {
  try {
    console.log('[Migration] Checking for pending migrations...');
    
    // Example Migration: Add isDeleted to all existing records if not present
    // This is where you'd define versions
    const migrations = [
      {
        version: 1,
        name: 'Initial Soft Delete Setup',
        run: async () => {
          // Logic for version 1
          // e.g., await User.updateMany({ isDeleted: { $exists: false } }, { isDeleted: false });
        }
      }
    ];

    for (const m of migrations) {
      const alreadyApplied = await Migration.findOne({ version: m.version });
      if (!alreadyApplied) {
        console.log(`[Migration] Applying version ${m.version}: ${m.name}...`);
        try {
          await m.run();
          await Migration.create({ version: m.version, name: m.name });
          console.log(`[Migration] Version ${m.version} applied successfully.`);
        } catch (err) {
          await Migration.create({ version: m.version, name: m.name, status: 'failed', error: err.message });
          console.error(`[Migration] Version ${m.version} failed:`, err.message);
          throw err;
        }
      }
    }
    
    console.log('[Migration] All migrations are up to date.');
  } catch (error) {
    console.error('[Migration] Fatal error during migration:', error.message);
  }
};
