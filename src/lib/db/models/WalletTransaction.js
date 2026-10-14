import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'topup',
        'ride_payment',
        'ride_earning',
        'refund',
        'cancellation_fee',
        'payout',
        // Platform commission charged directly to a driver (reserved)
        'commission',
      ],
      required: true,
    },
    // Positive = credit, negative = debit
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    note: {
      type: String,
      maxlength: 200,
      default: '',
    },
    // External reference (e.g. Stripe checkout session id) — makes credits
    // idempotent when both the webhook and the return page try to apply them
    ref: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ ref: 1 }, { unique: true, sparse: true });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model('WalletTransaction', walletTransactionSchema);
export default WalletTransaction;
