import asyncHandler from 'express-async-handler';
import WaafiPayService from '../services/WaafiPayService.js';
import PaymentService from '../services/PaymentService.js';

/**
 * WaafiPay Controller
 * Handles all WaafiPay specific HTTP endpoints
 */

export const getWaafiSettings = asyncHandler(async (req, res) => {
  const settings = await PaymentService.getPaymentSettings(req.schoolId, 'WAAFIPAY');
  res.json({
    success: true,
    settings: PaymentService.maskSecrets(settings) || null
  });
});

export const saveWaafiSettings = asyncHandler(async (req, res) => {
  const data = { ...req.body, provider: 'WAAFIPAY' };
  const settings = await PaymentService.savePaymentSettings(
    data,
    req.schoolId,
    req.user._id
  );
  res.json({
    success: true,
    message: 'WaafiPay settings saved successfully',
    settings
  });
});

export const testConnection = asyncHandler(async (req, res) => {
  const credentials = req.body.credentials || null;
  const result = await WaafiPayService.testConnection(req.schoolId, req.user._id, credentials);
  res.json(result);
});

export const purchase = asyncHandler(async (req, res) => {
  // Mobile app passes customId or user details, we ensure studentId is set
  const studentId = req.body.studentId || req.user?._id;
  
  const result = await WaafiPayService.purchase(
    { ...req.body, studentId },
    req.schoolId,
    req.branchId,
    req.user?._id,
    req
  );
  res.json(result);
});

export const reversal = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const result = await WaafiPayService.reversal(
    transactionId,
    req.schoolId,
    req.user._id,
    req
  );
  res.json(result);
});

export const processWebhook = asyncHandler(async (req, res) => {
  const { schoolId } = req.params;
  // WaafiPay typically sends signature in headers, adjust based on exact docs.
  // Common is X-Waafi-Signature or within payload. If inside payload, we extract it in service.
  const signature = req.headers['x-waafi-signature'] || req.headers['x-signature'] || '';
  
  // Use rawBody for HMAC verification
  const result = await WaafiPayService.processWebhookEvent(
    req.body, // this must be the raw buffer if express.raw() is used!
    signature,
    schoolId
  );

  // Always return 200 immediately to acknowledge WaafiPay
  res.status(200).json(result);
});

export default {
  getWaafiSettings,
  saveWaafiSettings,
  testConnection,
  purchase,
  reversal,
  processWebhook
};
