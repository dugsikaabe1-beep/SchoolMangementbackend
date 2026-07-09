import mongoose from 'mongoose';

/**
 * Transaction Model
 * Tracks all payment transactions with comprehensive audit trail
 */
const transactionSchema = new mongoose.Schema(
  {
    // Tenant and Branch isolation
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },

    // Related entities
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MonthlyPayment',
      index: true
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      index: true
    },

    // Transaction identifiers
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    providerTransactionId: {
      type: String,
      index: true
    },
    referenceNumber: {
      type: String,
      trim: true
    },

    // Payment provider
    provider: {
      type: String,
      required: true,
      enum: ['EVC_PLUS', 'ZAAD', 'SAHAL', 'SALAAM_BANK', 'PREMIER_BANK', 'CASH', 'BANK_TRANSFER', 'WAAFIPAY'],
      index: true
    },

    // Transaction details
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    fee: {
      type: Number,
      default: 0
    },
    netAmount: {
      type: Number,
      required: true
    },

    // Payment type
    paymentType: {
      type: String,
      enum: ['FULL_PAYMENT', 'PARTIAL_PAYMENT', 'INSTALLMENT', 'ADVANCE_PAYMENT'],
      default: 'FULL_PAYMENT'
    },

    // Status
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'REVERSED', 'PREAUTHORIZED', 'COMMITTED'],
      default: 'PENDING',
      index: true
    },
    failureReason: {
      type: String,
      trim: true
    },

    // WaafiPay Specific Fields
    issuerTransactionId: {
      type: String,
      index: true
    },
    merchantCharges: {
      type: Number,
      default: 0
    },
    waafiState: {
      type: String,
      trim: true
    },
    preAuthRef: {
      type: String,
      index: true
    },

    // Customer information
    customerName: {
      type: String,
      trim: true
    },
    customerPhone: {
      type: String,
      trim: true
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true
    },

    // Payment description
    description: {
      type: String,
      trim: true
    },
    items: [{
      type: mongoose.Schema.Types.Mixed
    }],

    // Timestamps
    initiatedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    },
    expiredAt: {
      type: Date
    },

    // Provider response data
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    webhookData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Receipt information
    receiptNumber: {
      type: String,
      index: true
    },
    receiptGenerated: {
      type: Boolean,
      default: false
    },

    // Refund information
    refundedAmount: {
      type: Number,
      default: 0
    },
    refundedAt: {
      type: Date
    },
    refundReason: {
      type: String,
      trim: true
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient queries
transactionSchema.index({ school: 1, branch: 1, createdAt: -1 });
transactionSchema.index({ school: 1, branch: 1, status: 1, createdAt: -1 });
transactionSchema.index({ school: 1, student: 1, createdAt: -1 });
transactionSchema.index({ school: 1, provider: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ providerTransactionId: 1 });
transactionSchema.index({ receiptNumber: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to calculate net amount
transactionSchema.pre('save', function(next) {
  if (this.amount !== undefined && this.fee !== undefined) {
    this.netAmount = this.amount - this.fee;
  }
  next();
});

// Virtual to check if transaction is successful
transactionSchema.virtual('isSuccessful').get(function() {
  return this.status === 'COMPLETED';
});

// Virtual to check if transaction is refundable
transactionSchema.virtual('isRefundable').get(function() {
  return this.status === 'COMPLETED' && this.refundedAmount < this.amount;
});

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
