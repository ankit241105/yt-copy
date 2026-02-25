import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      required: true,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    cloudinaryVideoPublicId: {
      type: String,
      default: null,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    cloudinaryThumbnailPublicId: {
      type: String,
      default: null,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    publishStatus: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "DRAFT",
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedByRole: {
      type: String,
      enum: ["SUPER_ADMIN", "MINI_ADMIN"],
      required: true,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

videoSchema.index({ publishStatus: 1, uploadDate: -1, _id: -1 });
videoSchema.index({ publishStatus: 1, viewCount: -1, uploadDate: -1, _id: -1 });
videoSchema.index({ uploadDate: -1, _id: -1 });
videoSchema.index({ uploadedBy: 1, publishStatus: 1, uploadDate: -1, _id: -1 });
videoSchema.index({ tags: 1, publishStatus: 1, uploadDate: -1, _id: -1 });
videoSchema.index({ title: "text", tags: "text" });

const Video = mongoose.model("Video", videoSchema);

export default Video;
