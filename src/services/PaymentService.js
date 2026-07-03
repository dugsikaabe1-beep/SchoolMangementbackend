import { v4 as uuidv4 } from 'uuid';
import PaymentSettings from '../models/PaymentSettings.js';
import Transaction from '../models/Transaction.js';
import Payment from '../models/Payment.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import User from '../models/User.js';
import PaymentProviderFactory from './paymentProviders/index.js';
import { logAction } from '../utils/auditLogger.js';
import { enqueueJob } from './jobQueue.js';

/**
 * Payment Service
 * Orchestrates the entire payment flow from initiation to completion
 */
export class PaymentService {
  /**
   * Get payment settings for a school
   * @param {string} schoolId School ID
   * @param {string} provider Provider type (optional)
   * @returns {Promise<Array|Object>} Payment settings
   */
  static async getPaymentSettings(schoolId, provider = null) {
    const query = { tenant: schoolId, isActive: true };
    
    if (provider) {
      query.provider = provider;
      return await PaymentSettings.findOne(query).select('+apiKey +secretKey +clientId +clientSecret +webhookSecret');
    }
    
    return await PaymentSettings.find(query);
  }

  /**
   * Create or update payment settings
   * @param {Object} data Payment settings data
   * @param {string} schoolId School ID
   * @param {string} userId User ID
   * @returns {Promise<Object>} Created/updated settings
   */
  static async savePaymentSettings(data, schoolId, userId) {
    const { provider, ...settingsData } = data;
    
    const existingSettings = await PaymentSettings.findOne({ tenant: schoolId, provider });
    
    if (existingSettings) {
      Object.assign(existingSettings, settingsData, { updatedBy: userId });
      return await existingSettings.save();
    } else {
      return await PaymentSettings.create({
        ...settingsData,
        tenant: schoolId,
        provider,
        createdBy: userId,
        updatedBy: userId
      });
    }
  }

  /**
   * Initiate a payment
   * @param {Object} paymentData Payment data
   * @param {string} schoolId School ID
   * @param {string} branchId Branch ID
   * @param {string} userId User ID
   * @returns {Promise<Object>} Payment initiation result
   */
  static async initiatePayment(paymentData, schoolId, branchId, userId) {
    const {
      provider,
      amount,
      currency,
      studentId,
      invoiceId,
      customerPhone,
      customerEmail,
      description,
      paymentType = 'FULL_PAYMENT'
    } = paymentData;

    // Get payment settings
    const paymentSettings = await this.getPaymentSettings(schoolId, provider);
    
    if (!paymentSettings) {
      throw new Error(`Payment settings not found for provider: ${provider}`);
    }

    // Create transaction
    const transactionId = uuidv4();
    const transaction = await Transaction.create({
      school: schoolId,
      branch: branchId,
      student: studentId,
      invoice: invoiceId,
      transactionId: transactionId,
      provider: provider,
      amount: amount,
      currency: currency || 'USD',
      netAmount: amount,
      paymentType: paymentType,
      status: 'PENDING',
      customerPhone: customerPhone,
      customerEmail: customerEmail,
      description: description,
      createdBy: userId
    });

    // Create payment provider instance
    const paymentProvider = PaymentProviderFactory.createProvider(provider, paymentSettings);

    // Initialize payment with provider
    const providerResult = await paymentProvider.initializePayment({
      amount,
      currency: currency || 'USD',
      customerPhone,
      customerEmail,
      description: description || 'School fee payment',
      transactionId: transactionId,
      metadata: {
        schoolId,
        branchId,
        studentId,
        invoiceId,
        userId
      }
    });

    // Update transaction with provider result
    if (providerResult.providerTransactionId) {
      transaction.providerTransactionId = providerResult.providerTransactionId;
    }
    if (providerResult.rawResponse) {
      transaction.providerResponse = providerResult.rawResponse;
    }
    await transaction.save();

    // Log action
    await logAction({ user: { _id: userId } }, {
      action: 'INITIATE_PAYMENT',
      module: 'PAYMENT',
      targetId: transaction._id,
      details: {
        transactionId,
        provider,
        amount
      }
    });

    return {
      success: providerResult.success,
      transactionId: transactionId,
      paymentUrl: providerResult.paymentUrl,
      status: providerResult.status,
      transaction: transaction
    };
  }

  /**
   * Verify a payment transaction
   * @param {string} transactionId Transaction ID
   * @param {string} schoolId School ID
   * @param {string} userId User ID
   * @returns {Promise<Object>} Verification result
   */
  static async verifyPayment(transactionId, schoolId, userId) {
    const transaction = await Transaction.findOne({ transactionId, school: schoolId });
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const paymentSettings = await this.getPaymentSettings(schoolId, transaction.provider);
    
    if (!paymentSettings) {
      throw new Error('Payment settings not found');
    }

    const paymentProvider = PaymentProviderFactory.createProvider(transaction.provider, paymentSettings);
    const verificationResult = await paymentProvider.verifyPayment(transaction.providerTransactionId || transactionId);

    // Update transaction
    transaction.status = verificationResult.status;
    transaction.providerResponse = verificationResult.rawResponse;
    transaction.updatedBy = userId;

    if (verificationResult.success && transaction.status === 'COMPLETED') {
      transaction.completedAt = new Date();
      await this.processCompletedPayment(transaction, userId);
    }

    await transaction.save();

    // Log action
    await logAction({ user: { _id: userId } }, {
      action: 'VERIFY_PAYMENT',
      module: 'PAYMENT',
      targetId: transaction._id,
      details: {
        transactionId,
        status: verificationResult.status
      }
    });

    return {
      success: verificationResult.success,
      status: verificationResult.status,
      transaction: transaction
    };
  }

  /**
   * Process webhook from payment provider
   * @param {string} provider Provider type
   * @param {Object} webhookData Webhook data
   * @param {string} signature Webhook signature
   * @param {string} schoolId School ID
   * @returns {Promise<Object>} Process result
   */
  static async processWebhook(provider, webhookData, signature, schoolId) {
    const paymentSettings = await this.getPaymentSettings(schoolId, provider);
    
    if (!paymentSettings) {
      throw new Error('Payment settings not found');
    }

    const paymentProvider = PaymentProviderFactory.createProvider(provider, paymentSettings);
    const webhookResult = await paymentProvider.processWebhook(webhookData, signature);

    const transaction = await Transaction.findOne({
      transactionId: webhookResult.transactionId,
      school: schoolId
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Update transaction
    transaction.status = webhookResult.status;
    transaction.webhookData = webhookResult.rawData;

    if (webhookResult.providerTransactionId) {
      transaction.providerTransactionId = webhookResult.providerTransactionId;
    }

    if (webhookResult.success && transaction.status === 'COMPLETED') {
      transaction.completedAt = new Date();
      await this.processCompletedPayment(transaction, null);
    }

    await transaction.save();

    return {
      success: webhookResult.success,
      transaction: transaction
    };
  }

  /**
   * Process a completed payment
   * @param {Object} transaction Transaction document
   * @param {string} userId User ID
   */
  static async processCompletedPayment(transaction, userId) {
    // Generate receipt number
    transaction.receiptNumber = this.generateReceiptNumber();
    transaction.receiptGenerated = true;

    // Update invoice if exists
    if (transaction.invoice) {
      const invoice = await MonthlyPayment.findById(transaction.invoice);
      if (invoice) {
        invoice.status = 'PAID';
        invoice.paidAmount = (invoice.paidAmount || 0) + transaction.amount;
        await invoice.save();
      }
    }

    // Create payment record
    if (transaction.student) {
      const academicYear = await this.getCurrentAcademicYear(transaction.school);
      await Payment.create({
        student: transaction.student,
        amount: transaction.amount,
        paymentMethod: transaction.provider,
        month: this.getCurrentMonth(),
        transactionId: transaction.transactionId,
        status: 'Paid',
        school: transaction.school,
        branch: transaction.branch,
        academicYear: academicYear?._id,
        receivedBy: userId
      });
    }

    // Send notifications
    await enqueueJob('notification.payment_received', {
      transactionId: transaction.transactionId,
      studentId: transaction.student,
      amount: transaction.amount,
      receiptNumber: transaction.receiptNumber
    });

    // Log action
    await logAction({ user: { _id: userId || transaction.createdBy } }, {
      action: 'PAYMENT_COMPLETED',
      module: 'PAYMENT',
      targetId: transaction._id,
      details: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        receiptNumber: transaction.receiptNumber
      }
    });
  }

  /**
   * Refund a payment
   * @param {string} transactionId Transaction ID
   * @param {number} amount Amount to refund
   * @param {string} reason Refund reason
   * @param {string} schoolId School ID
   * @param {string} userId User ID
   * @returns {Promise<Object>} Refund result
   */
  static async refundPayment(transactionId, amount, reason, schoolId, userId) {
    const transaction = await Transaction.findOne({ transactionId, school: schoolId });
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (!transaction.isRefundable) {
      throw new Error('Transaction is not refundable');
    }

    const paymentSettings = await this.getPaymentSettings(schoolId, transaction.provider);
    
    if (!paymentSettings) {
      throw new Error('Payment settings not found');
    }

    const paymentProvider = PaymentProviderFactory.createProvider(transaction.provider, paymentSettings);
    const refundResult = await paymentProvider.refundPayment(
      transaction.providerTransactionId || transactionId,
      amount,
      reason
    );

    if (refundResult.success) {
      transaction.status = 'REFUNDED';
      transaction.refundedAmount = amount;
      transaction.refundedAt = new Date();
      transaction.refundReason = reason;
      transaction.updatedBy = userId;
      await transaction.save();

      // Log action
      await logAction({ user: { _id: userId } }, {
        action: 'REFUND_PAYMENT',
        module: 'PAYMENT',
        targetId: transaction._id,
        details: {
          transactionId,
          amount,
          reason
        }
      });
    }

    return refundResult;
  }

  /**
   * Get transaction history
   * @param {Object} filters Filter options
   * @param {string} schoolId School ID
   * @param {string} branchId Branch ID
   * @param {number} page Page number
   * @param {number} limit Items per page
   * @returns {Promise<Object>} Transaction history
   */
  static async getTransactionHistory(filters = {}, schoolId, branchId, page = 1, limit = 20) {
    const query = { school: schoolId, isDeleted: false };
    
    if (branchId) {
      query.branch = branchId;
    }
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.provider) {
      query.provider = filters.provider;
    }
    
    if (filters.studentId) {
      query.student = filters.studentId;
    }
    
    if (filters.startDate && filters.endDate) {
      query.createdAt = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('student', 'name customId')
      .populate('createdBy', 'name email');

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get transaction by ID
   * @param {string} transactionId Transaction ID
   * @param {string} schoolId School ID
   * @returns {Promise<Object>} Transaction
   */
  static async getTransaction(transactionId, schoolId) {
    return await Transaction.findOne({ transactionId, school: schoolId, isDeleted: false })
      .populate('student', 'name customId')
      .populate('invoice')
      .populate('createdBy', 'name email');
  }

  /**
   * Generate receipt number
   * @returns {string} Receipt number
   */
  static generateReceiptNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000);
    return `RCP-${year}${month}-${random}`;
  }

  /**
   * Get current academic year
   * @param {string} schoolId School ID
   * @returns {Promise<Object>} Academic year
   */
  static async getCurrentAcademicYear(schoolId) {
    const AcademicYear = (await import('../models/AcademicYear.js')).default;
    return await AcademicYear.findOne({ school: schoolId, isActive: true });
  }

  /**
   * Get current month
   * @returns {string} Current month
   */
  static getCurrentMonth() {
    const date = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[date.getMonth()];
  }

  /**
   * Get payment instructions
   * @param {string} provider Provider type
   * @param {Object} paymentData Payment data
   * @param {string} schoolId School ID
   * @returns {Promise<Object>} Payment instructions
   */
  static async getPaymentInstructions(provider, paymentData, schoolId) {
    const paymentSettings = await this.getPaymentSettings(schoolId, provider);
    
    if (!paymentSettings) {
      throw new Error('Payment settings not found');
    }

    const paymentProvider = PaymentProviderFactory.createProvider(provider, paymentSettings);
    return await paymentProvider.getPaymentInstructions(paymentData);
  }
}

export default PaymentService;
