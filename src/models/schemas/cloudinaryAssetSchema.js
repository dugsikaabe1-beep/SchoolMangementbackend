import mongoose from 'mongoose';

/**
 * Cloudinary metadata stored alongside URL fields in MongoDB.
 * Never store binary file data in the database.
 */
export const cloudinaryAssetSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    format: { type: String, trim: true },
    resourceType: { type: String, trim: true },
    bytes: { type: Number },
    width: { type: Number },
    height: { type: Number },
    thumbnailUrl: { type: String, trim: true },
  },
  { _id: false }
);

export default cloudinaryAssetSchema;
