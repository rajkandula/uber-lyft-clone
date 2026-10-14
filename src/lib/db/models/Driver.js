import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    license: {
      number: { type: String, default: '' },
      expiry: { type: Date },
      imageUrl: { type: String, default: '' },
      verified: { type: Boolean, default: false },
    },
    vehicle: {
      make: { type: String, default: '' },
      model: { type: String, default: '' },
      year: { type: Number },
      color: { type: String, default: '' },
      plate: { type: String, default: '' },
      type: {
        type: String,
        enum: ['economy', 'comfort', 'premium', 'xl'],
        default: 'economy',
      },
      imageUrl: { type: String, default: '' },
    },
    documents: [
      {
        type: {
          type: String,
          enum: ['license', 'insurance', 'registration', 'background_check', 'profile_photo'],
        },
        url: { type: String, required: true },
        verified: { type: Boolean, default: false },
        uploadedAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date },
        rejectionReason: { type: String },
      },
    ],
    // Stripe Connect Express — where trip earnings are paid out
    payouts: {
      stripeAccountId: { type: String, default: '' },
      detailsSubmitted: { type: Boolean, default: false },
      payoutsEnabled: { type: Boolean, default: false },
      lastPayoutAt: { type: Date },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    lastLocationUpdate: {
      type: Date,
    },
    currentRideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    stats: {
      totalTrips: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      totalOnlineHours: { type: Number, default: 0 },
      acceptanceRate: { type: Number, default: 100, min: 0, max: 100 },
      cancellationRate: { type: Number, default: 0, min: 0, max: 100 },
      averageRating: { type: Number, default: 5.0, min: 0, max: 5 },
    },
    // ─── H3 Spatial Index Fields ──────────────────────
    h3Cell: {
      type: String,
      index: true,
      default: null,
    },
    h3Resolution: {
      type: Number,
      default: 9,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Geospatial + compound index for finding nearby available drivers
driverSchema.index({ location: '2dsphere' });
driverSchema.index({ isOnline: 1, isApproved: 1, 'vehicle.type': 1 });
// H3 cell index for hex-based spatial queries (fallback when Redis is cold)
driverSchema.index({ h3Cell: 1, isOnline: 1, isApproved: 1 });
// userId is already indexed by its field-level `unique: true`
driverSchema.index({ currentRideId: 1 });

// Virtual: populate user data
driverSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
export default Driver;
