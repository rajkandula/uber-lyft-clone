import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    driverProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    status: {
      type: String,
      enum: [
        'searching',
        'accepted',
        'arrived',
        'in_progress',
        'completed',
        'cancelled',
        'no_drivers',
      ],
      default: 'searching',
    },
    pickup: {
      address: { type: String, required: true },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true },
      },
      arrivedAt: { type: Date },
    },
    dropoff: {
      address: { type: String, required: true },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true },
      },
    },
    route: {
      distanceMeters: { type: Number, default: 0 },
      durationSeconds: { type: Number, default: 0 },
      // GeoJSON LineString coordinates [[lng,lat],...] from OSRM
      geometry: { type: [[Number]], default: undefined },
      actualDistanceMeters: { type: Number },
      actualDurationSeconds: { type: Number },
    },
    vehicleType: {
      type: String,
      enum: ['economy', 'comfort', 'premium', 'xl'],
      default: 'economy',
    },
    fare: {
      baseFare: { type: Number, default: 0 },
      distanceFare: { type: Number, default: 0 },
      timeFare: { type: Number, default: 0 },
      surgeFare: { type: Number, default: 0 },
      surgeMultiplier: { type: Number, default: 1.0 },
      bookingFee: { type: Number, default: 0 },
      tip: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      driverEarnings: { type: Number, default: 0 },
      cancellationFee: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      estimatedTotal: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
    },
    payment: {
      method: {
        type: String,
        // 'cash' retained for historical rides; new rides are wallet-only
        enum: ['wallet', 'cash'],
        default: 'wallet',
      },
      status: {
        type: String,
        enum: ['pending', 'captured', 'failed', 'refunded', 'waived'],
        default: 'pending',
      },
    },
    // 4-digit code the rider shows the driver at pickup
    pin: {
      type: String,
      default: '',
    },
    rating: {
      byRider: { type: Number, min: 1, max: 5 },
      byDriver: { type: Number, min: 1, max: 5 },
      riderComment: { type: String, maxlength: 500 },
      driverComment: { type: String, maxlength: 500 },
    },
    messages: [
      {
        from: { type: String, enum: ['rider', 'driver'], required: true },
        text: { type: String, required: true, maxlength: 500 },
        at: { type: Date, default: Date.now },
      },
    ],
    dispatch: {
      offeredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
      declinedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
      offersSent: { type: Number, default: 0 },
    },
    timeline: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        location: {
          type: { type: String, enum: ['Point'] },
          coordinates: { type: [Number] },
        },
        note: { type: String },
      },
    ],
    cancelledBy: {
      type: String,
      enum: ['rider', 'driver', 'system'],
    },
    cancellationReason: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
rideSchema.index({ riderId: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, createdAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ 'pickup.location': '2dsphere' });

// Virtual: ride duration in minutes
rideSchema.virtual('durationMinutes').get(function () {
  if (this.startedAt && this.completedAt) {
    return Math.round((this.completedAt - this.startedAt) / 60000);
  }
  return null;
});

// Statuses in which a ride is considered "live" for its participants
export const ACTIVE_STATUSES = ['searching', 'accepted', 'arrived', 'in_progress'];

const Ride = mongoose.models.Ride || mongoose.model('Ride', rideSchema);
export default Ride;
