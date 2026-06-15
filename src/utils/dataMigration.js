/**
 * Non-destructive startup migrations for legacy data compatibility.
 */
export async function runStartupMigrations() {
  try {
    const User = (await import('../models/User.js')).default;

    const emptyStringResult = await User.collection.updateMany(
      { profileImage: '' },
      { $unset: { profileImage: 1 } }
    );

    const nullResult = await User.collection.updateMany(
      { profileImage: null },
      { $unset: { profileImage: 1 } }
    );

    const whitespaceResult = await User.collection.updateMany(
      { profileImage: { $type: 'string', $regex: /^\s*$/ } },
      { $unset: { profileImage: 1 } }
    );

    const total =
      (emptyStringResult.modifiedCount || 0) +
      (nullResult.modifiedCount || 0) +
      (whitespaceResult.modifiedCount || 0);

    if (total > 0) {
      console.log(`[Migration] Normalized ${total} legacy profileImage value(s)`);
    }
  } catch (error) {
    console.error('[Migration] Startup migration failed:', error.message);
  }
}

export default runStartupMigrations;
