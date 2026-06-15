import User from '../models/User.js';

const isProfileImageCastError = (error) =>
  error?.name === 'ValidationError' &&
  error.errors?.profileImage?.kind === 'cast';

/**
 * Load a user document, repairing legacy empty profileImage values if needed.
 */
export async function findUserSafely(query, populate = []) {
  try {
    let q = User.findOne(query);
    for (const p of populate) {
      q = q.populate(p);
    }
    return await q;
  } catch (error) {
    if (!isProfileImageCastError(error)) throw error;

    const raw = await User.collection.findOne(query);
    if (!raw?._id) return null;

    await User.collection.updateOne({ _id: raw._id }, { $unset: { profileImage: 1 } });

    let q = User.findOne(query);
    for (const p of populate) {
      q = q.populate(p);
    }
    return await q;
  }
}

export default findUserSafely;
