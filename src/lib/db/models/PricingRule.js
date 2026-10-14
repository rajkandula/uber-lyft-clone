import mongoose from 'mongoose';

const pricingRuleSchema = new mongoose.Schema(
  {
    vehicleType: {
      type: String,
      enum: ['economy', 'comfort', 'premium', 'xl'],
      required: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    baseFare: {
      type: Number,
      required: true,
      default: 2.5,
    },
    perKmRate: {
      type: Number,
      required: true,
      default: 1.5,
    },
    perMinRate: {
      type: Number,
      required: true,
      default: 0.25,
    },
    minimumFare: {
      type: Number,
      required: true,
      default: 5.0,
    },
    bookingFee: {
      type: Number,
      default: 1.0,
    },
    platformCommission: {
      type: Number,
      required: true,
      default: 20, // percentage
      min: 0,
      max: 50,
    },
    surgeMultiplierCap: {
      type: Number,
      default: 3.0,
      min: 1.0,
      max: 10.0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

pricingRuleSchema.index({ vehicleType: 1, city: 1 }, { unique: true });

const PricingRule =
  mongoose.models.PricingRule || mongoose.model('PricingRule', pricingRuleSchema);
export default PricingRule;
