/**
 * Reusable soft delete query filter
 */
export const activeOnly = (query = {}) => {
  return {
    ...query,
    deletedAt: { $exists: false },
    isDeleted: { $ne: true },
  };
};

/**
 * Perform a soft delete on a document
 */
export const softDelete = async (model, id, userId) => {
  return await model.findByIdAndUpdate(
    id,
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    },
    { new: true }
  );
};

/**
 * Restore a soft-deleted document
 */
export const restoreRecord = async (model, id, userId) => {
  return await model.findByIdAndUpdate(
    id,
    {
      $set: {
        isDeleted: false,
        updatedBy: userId,
      },
      $unset: {
        deletedAt: 1,
        deletedBy: 1,
      },
    },
    { new: true }
  );
};
