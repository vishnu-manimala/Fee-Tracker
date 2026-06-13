const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'Format must be YYYY-YY e.g. 2026-27'],
    },

    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    amount: {
      type: Number,
      default: null,
    },

    paidOn: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ['paid', 'due', 'none'],
      default: 'none',
    },


    note: { type: String, default: '' },
  },
  { _id: true }
);


const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Name too long'],
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School is required'],
    },

    place: {
      type: String,
      trim: true,
      default: '',
    },

    monthlyFee: {
      type: Number,
      required: [true, 'Monthly fee is required'],
      min: [0, 'Fee cannot be negative'],
    },

    advanceFee: {
      type: Number,
      default: 0,
      min: [0, 'Advance fee cannot be negative'],
    },

    isActive: { type: Boolean, default: true },

    payments: [paymentSchema],

    lastReminderSentAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);


studentSchema.virtual('currentMonthStatus').get(function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  const startMonth = parseInt(process.env.ACADEMIC_YEAR_START_MONTH || '6');
  const ayYear = month >= startMonth ? year : year - 1;
  const academicYear = `${ayYear}-${String(ayYear + 1).slice(2)}`;

  const record = this.payments.find(
    (p) => p.academicYear === academicYear && p.month === month
  );
  return record ? record.status : 'none';
});

// ── Indexes ───────────────────────────────────────────────────────────────
studentSchema.index({ phone: 1 });
studentSchema.index({ school: 1, isActive: 1 });
studentSchema.index({ fullName: 'text' });
studentSchema.index(
  { 'payments.academicYear': 1, 'payments.month': 1 },
  { sparse: true }
);

module.exports = mongoose.model('Student', studentSchema);
