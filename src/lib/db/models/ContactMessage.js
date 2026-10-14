import mongoose from 'mongoose';

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    topic: {
      type: String,
      enum: ['general', 'ride_issue', 'driver_support', 'payments', 'safety', 'data_request'],
      default: 'general',
    },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    // Set automatically when a signed-in user submits
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
    },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

contactMessageSchema.index({ status: 1, createdAt: -1 });

const ContactMessage =
  mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactMessageSchema);
export default ContactMessage;
