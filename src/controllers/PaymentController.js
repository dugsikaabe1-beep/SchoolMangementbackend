import asyncHandler from 'express-async-handler';
import PaymentService from '../services/PaymentService.js';
import PaymentProviderFactory from '../services/paymentProviders/index.js';

/**
 * Payment Controller
 * Handles all payment-related API endpoints
 */

/**
 * Get supported payment providers
 */
export const getSupportedProviders = asyncHandler(async (req, res) => {
  const providers = PaymentProviderFactory.getSupportedProviders();
  res.json({
    success: true,
    providers: providers
  });
});

/**
 * Get payment settings for a school
 */
export const getPaymentSettings = asyncHandler(async (req, res) => {
  const { provider } = req.query;
  const settings = await PaymentService.getPaymentSettings(req.schoolId, provider);
  res.json({
    success: true,
    settings: settings
  });
});

/**
 * Save payment settings
 */
export const savePaymentSettings = asyncHandler(async (req, res) => {
  const settings = await PaymentService.savePaymentSettings(
    req.body,
    req.schoolId,
    req.user._id
  );
  res.json({
    success: true,
    message: 'Payment settings saved successfully',
    settings: settings
  });
});

/**
 * Initiate a payment
 */
export const initiatePayment = asyncHandler(async (req, res) => {
  const result = await PaymentService.initiatePayment(
    req.body,
    req.schoolId,
    req.branchId,
    req.user._id
  );
  res.json({
    success: result.success,
    ...result
  });
});

/**
 * Verify a payment
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const result = await PaymentService.verifyPayment(
    transactionId,
    req.schoolId,
    req.user._id
  );
  res.json({
    success: result.success,
    ...result
  });
});

/**
 * Process webhook
 */
export const processWebhook = asyncHandler(async (req, res) => {
  const { provider, schoolId } = req.params;
  const signature = req.headers['x-webhook-signature'] || 
                    req.headers['x-signature'] || 
                    req.headers['signature'];

  const result = await PaymentService.processWebhook(
    provider,
    req.body,
    signature,
    schoolId
  );

  res.json({
    success: result.success,
    message: 'Webhook processed successfully'
  });
});

/**
 * Refund a payment
 */
export const refundPayment = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { amount, reason } = req.body;

  const result = await PaymentService.refundPayment(
    transactionId,
    amount,
    reason,
    req.schoolId,
    req.user._id
  );

  res.json({
    success: result.success,
    ...result
  });
});

/**
 * Get transaction history
 */
export const getTransactionHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, provider, studentId, startDate, endDate } = req.query;

  const result = await PaymentService.getTransactionHistory(
    { status, provider, studentId, startDate, endDate },
    req.schoolId,
    req.branchId,
    parseInt(page),
    parseInt(limit)
  );

  res.json({
    success: true,
    ...result
  });
});

/**
 * Get transaction by ID
 */
export const getTransaction = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const transaction = await PaymentService.getTransaction(transactionId, req.schoolId);

  if (!transaction) {
    res.status(404);
    throw new Error('Transaction not found');
  }

  res.json({
    success: true,
    transaction: transaction
  });
});

/**
 * Get payment instructions
 */
export const getPaymentInstructions = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const instructions = await PaymentService.getPaymentInstructions(
    provider,
    req.body,
    req.schoolId
  );

  res.json({
    success: true,
    instructions: instructions
  });
});

/**
 * Get dashboard payment stats
 */
export const getPaymentStats = asyncHandler(async (req, res) => {
  const Transaction = (await import('../models/Transaction.js')).default;
  const Payment = (await import('../models/Payment.js')).default;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalTransactions,
    completedTransactions,
    totalRevenue,
    monthlyRevenue
  ] = await Promise.all([
    Transaction.countDocuments({ school: req.schoolId, isDeleted: false }),
    Transaction.countDocuments({ school: req.schoolId, status: 'COMPLETED', isDeleted: false }),
    Transaction.aggregate([
      { $match: { school: req.schoolId, status: 'COMPLETED', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Transaction.aggregate([
      { $match: { school: req.schoolId, status: 'COMPLETED', isDeleted: false, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  res.json({
    success: true,
    stats: {
      totalTransactions,
      completedTransactions,
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyRevenue: monthlyRevenue[0]?.total || 0
    }
  });
});

export default {
  getSupportedProviders,
  getPaymentSettings,
  savePaymentSettings,
  initiatePayment,
  verifyPayment,
  processWebhook,
  refundPayment,
  getTransactionHistory,
  getTransaction,
  getPaymentInstructions,
  getPaymentStats
};
