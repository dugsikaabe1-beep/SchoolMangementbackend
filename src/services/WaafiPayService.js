import { v4 as uuidv4 } from 'uuid';
import PaymentService from './PaymentService.js';
import PaymentSettings from '../models/PaymentSettings.js';
import Transaction from '../models/Transaction.js';
import WebhookLog from '../models/WebhookLog.js';
import WaafiPayAuditLog from '../models/WaafiPayAuditLog.js';
import PaymentProviderFactory from './paymentProviders/index.js';
import { logAction } from '../utils/auditLogger.js';

export class WaafiPayService {
  /**
   * Helper to write to dedicated WaafiPay Audit Log
   */
  static async logAudit({ schoolId, branchId, userId, operation, transactionId, waafiTransactionId, requestPayload, responsePayload, durationMs, success, errorCode, errorMessage, ip, userAgent }) {
    try {
      await WaafiPayAuditLog.create({
        school: schoolId,
        branch: branchId,
        user: userId,
        operation,
        transactionId,
        waafiTransactionId,
        requestPayload,
        responsePayload,
        durationMs,
        success,
        errorCode,
        errorMessage,
        ip,
        userAgent
      });
    } catch (e) {
      console.error('[WaafiPay Audit Error]', e);
    }
  }

  /**
   * Test Connection to WaafiPay Sandbox
   */
  static async testConnection(schoolId, userId, credentials = null) {
    const startMs = Date.now();
    try {
      let settings = credentials;
      if (!settings) {
        settings = await PaymentService.getPaymentSettings(schoolId, 'WAAFIPAY');
      }
      if (!settings) {
        throw new Error('WaafiPay is not configured for this school.');
      }
      if (!settings.isEnabled) {
        throw new Error('WaafiPay integration is currently disabled.');
      }

      const provider = PaymentProviderFactory.createProvider('WAAFIPAY', settings);
      
      // We do a minimal ping or a preauth with 0 to test credentials.
      // WaafiPay doesn't have a pure 'ping'. We will attempt to call API_PURCHASE with an invalid format or just check if it rejects with auth error vs validation error.
      // Easiest is to send a malformed request and check if we get an auth failure (401/403) or a business error (200 OK but responseCode != 2001).
      
      // Let's do a tiny request.
      const rawResponse = await provider.makeRequest('API_PURCHASE', {
        merchantUid: provider.merchantUid,
        apiUserId: provider.apiUserId,
        apiKey: provider.apiKey,
        paymentMethod: 'mwallet_account',
        payerInfo: { accountNo: 'TEST_CONNECTION' },
        transactionInfo: {
          referenceId: uuidv4(),
          invoiceId: 'TEST',
          amount: 1,
          currency: 'USD',
          description: 'Test Connection'
        }
      });

      // If we get a response, the endpoint is reachable.
      // If it's an auth error, we'll know.
      const isAuthError = rawResponse.responseCode === '401' || rawResponse.responseMsg?.toLowerCase().includes('auth');
      
      const success = !isAuthError && !!rawResponse.responseCode;
      const durationMs = Date.now() - startMs;

      await this.logAudit({
        schoolId, userId, operation: 'TEST_CONNECTION', durationMs, success,
        requestPayload: { target: provider.getBaseUrl() },
        responsePayload: rawResponse,
        errorMessage: isAuthError ? 'Authentication failed' : null
      });

      if (!success) {
        throw new Error(`Connection failed: ${rawResponse.responseMsg || 'Invalid credentials'}`);
      }

      return { success: true, latencyMs: durationMs, message: 'Sandbox connection OK' };
    } catch (error) {
      await this.logAudit({
        schoolId, userId, operation: 'TEST_CONNECTION',
        durationMs: Date.now() - startMs, success: false,
        errorMessage: error.message
      });
      return { success: false, message: error.message };
    }
  }

  /**
   * Initiate WaafiPay Purchase
   */
  static async purchase(data, schoolId, branchId, userId, req) {
    const startMs = Date.now();
    const transactionId = uuidv4();
    
    try {
      // 1. Get settings
      const settings = await PaymentService.getPaymentSettings(schoolId, 'WAAFIPAY');
      if (!settings || !settings.isEnabled) {
        throw new Error('WaafiPay is not configured or is disabled.');
      }

      // 2. Prevent duplicates (Idempotency) if client passed a reference
      if (data.referenceId) {
        const existing = await Transaction.findOne({ referenceNumber: data.referenceId, school: schoolId });
        if (existing) {
          throw new Error('Duplicate transaction reference.');
        }
      }

      // 3. Create pending transaction
      const transaction = await Transaction.create({
        school: schoolId,
        branch: branchId,
        student: data.studentId,
        invoice: data.invoiceId,
        transactionId: transactionId,
        referenceNumber: data.referenceId || transactionId,
        provider: 'WAAFIPAY',
        amount: data.amount,
        currency: data.currency || 'USD',
        netAmount: data.amount,
        paymentType: 'FULL_PAYMENT',
        status: 'PENDING',
        customerPhone: data.customerPhone,
        description: data.description,
        createdBy: userId
      });

      // 4. Initialize Provider
      const provider = PaymentProviderFactory.createProvider('WAAFIPAY', settings);
      
      // 5. Call API
      const result = await provider.initializePayment({
        amount: data.amount,
        currency: data.currency,
        customerPhone: data.customerPhone,
        description: data.description,
        transactionId: transactionId
      });

      // 6. Update transaction
      if (result.providerTransactionId) {
        transaction.issuerTransactionId = result.providerTransactionId;
        transaction.providerTransactionId = result.providerTransactionId;
      }
      if (result.merchantCharges) transaction.merchantCharges = result.merchantCharges;
      if (result.waafiState) transaction.waafiState = result.waafiState;
      transaction.status = result.status;
      transaction.providerResponse = result.rawResponse;

      if (result.status === 'COMPLETED') {
        transaction.completedAt = new Date();
        await PaymentService.processCompletedPayment(transaction, userId);
      } else if (result.status === 'FAILED') {
        transaction.failureReason = result.error || result.rawResponse?.responseMsg;
      }

      await transaction.save();

      // 7. Audit Log
      await this.logAudit({
        schoolId, branchId, userId, operation: 'PURCHASE',
        transactionId: transaction.transactionId,
        waafiTransactionId: result.providerTransactionId,
        durationMs: Date.now() - startMs,
        success: result.success,
        responsePayload: result.rawResponse,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent']
      });

      return {
        success: result.success,
        transactionId: transaction.transactionId,
        status: transaction.status,
        receipt: transaction.receiptNumber || null
      };

    } catch (error) {
      await this.logAudit({
        schoolId, branchId, userId, operation: 'PURCHASE',
        transactionId,
        durationMs: Date.now() - startMs,
        success: false,
        errorMessage: error.message,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent']
      });
      throw error;
    }
  }

  /**
   * Reverse WaafiPay Transaction
   */
  static async reversal(transactionId, schoolId, userId, req) {
    const startMs = Date.now();
    try {
      const transaction = await Transaction.findOne({ transactionId, school: schoolId });
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.status !== 'COMPLETED') throw new Error('Only completed transactions can be reversed');

      const settings = await PaymentService.getPaymentSettings(schoolId, 'WAAFIPAY');
      const provider = PaymentProviderFactory.createProvider('WAAFIPAY', settings);
      
      const result = await provider.reversalPayment(transactionId);

      if (result.success && result.status === 'REVERSED') {
        transaction.status = 'REVERSED';
        transaction.refundedAmount = transaction.amount;
        transaction.refundedAt = new Date();
        transaction.refundReason = 'Admin Reversal';
        transaction.waafiState = result.waafiState;
        transaction.providerResponse = result.rawResponse;
        transaction.updatedBy = userId;
        
        // Reverse Invoice
        if (transaction.invoice) {
          const MonthlyPayment = (await import('../models/MonthlyPayment.js')).default;
          const invoice = await MonthlyPayment.findById(transaction.invoice);
          if (invoice) {
            invoice.status = 'UNPAID';
            invoice.paidAmount = Math.max(0, (invoice.paidAmount || 0) - transaction.amount);
            await invoice.save();
          }
        }
        
        // Mark Payment record as deleted/reversed
        const Payment = (await import('../models/Payment.js')).default;
        await Payment.updateMany(
          { transactionId: transaction.transactionId },
          { $set: { status: 'Failed', remarks: 'Reversed via WaafiPay', isDeleted: true, deletedAt: new Date(), deletedBy: userId } }
        );

        await transaction.save();

        await logAction({ user: { _id: userId } }, {
          action: 'WAAFIPAY_REVERSAL',
          module: 'PAYMENT',
          targetId: transaction._id
        });
      }

      await this.logAudit({
        schoolId, userId, operation: 'REVERSAL',
        transactionId,
        waafiTransactionId: result.providerTransactionId,
        durationMs: Date.now() - startMs,
        success: result.success,
        responsePayload: result.rawResponse,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent']
      });

      return { success: result.success, status: transaction.status };
    } catch (error) {
      await this.logAudit({
        schoolId, userId, operation: 'REVERSAL',
        transactionId,
        durationMs: Date.now() - startMs,
        success: false,
        errorMessage: error.message,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent']
      });
      throw error;
    }
  }

  /**
   * Process incoming Webhook from WaafiPay
   */
  static async processWebhookEvent(rawBody, signature, schoolId) {
    const startMs = Date.now();
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      throw new Error('Invalid JSON payload');
    }

    const { referenceId, state, issuerTransactionId, timestamp } = parsedBody;
    if (!referenceId) throw new Error('Missing referenceId in webhook payload');

    try {
      const settings = await PaymentService.getPaymentSettings(schoolId, 'WAAFIPAY');
      if (!settings) throw new Error('WaafiPay not configured for school');

      const provider = PaymentProviderFactory.createProvider('WAAFIPAY', settings);
      
      // 1. Verify Signature
      const isValid = provider.verifyWebhookSignature(rawBody, signature);
      if (!isValid) throw new Error('Invalid webhook signature');

      // 2. Validate Timestamp to prevent replay attacks (e.g. max 5 mins old)
      const windowSecs = parseInt(process.env.WEBHOOK_REPLAY_WINDOW_SECONDS || '300', 10);
      const eventTime = new Date(timestamp).getTime();
      const now = Date.now();
      if (now - eventTime > windowSecs * 1000) {
        throw new Error('Webhook timestamp too old (replay protection)');
      }

      // 3. Deduplicate Event
      // Since Waafi doesn't always provide a distinct webhook event ID, we use referenceId + state + timestamp
      const eventId = `${referenceId}_${state}_${timestamp}`;
      const existingLog = await WebhookLog.findOne({ provider: 'WAAFIPAY', school: schoolId, eventId });
      
      if (existingLog) {
        // Return 200 immediately to acknowledge receipt but do not reprocess
        return { success: true, message: 'Duplicate webhook skipped' };
      }

      // 4. Create WebhookLog
      const logEntry = await WebhookLog.create({
        provider: 'WAAFIPAY',
        school: schoolId,
        eventId,
        event: 'PAYMENT_UPDATE',
        payload: parsedBody,
        signature,
        signatureValid: true
      });

      // 5. Update Transaction
      const transaction = await Transaction.findOne({ 
        $or: [ { transactionId: referenceId }, { providerTransactionId: issuerTransactionId } ],
        school: schoolId 
      });

      if (!transaction) {
        logEntry.processingResult = 'Transaction not found';
        await logEntry.save();
        throw new Error('Transaction not found');
      }

      const mappedStatus = provider.mapWaafiStateToInternal(state);
      
      // Only process if status actually changed
      if (transaction.status !== mappedStatus) {
        transaction.status = mappedStatus;
        transaction.waafiState = state;
        transaction.webhookData = parsedBody;

        if (mappedStatus === 'COMPLETED') {
          transaction.completedAt = new Date();
          await PaymentService.processCompletedPayment(transaction, null);
        } else if (mappedStatus === 'FAILED' || mappedStatus === 'CANCELLED') {
          transaction.failureReason = parsedBody.responseMsg || 'Webhook failure update';
        }

        await transaction.save();
      }

      // 6. Finalize Log
      logEntry.processed = true;
      logEntry.processedAt = new Date();
      logEntry.processingResult = `Status updated to ${mappedStatus}`;
      await logEntry.save();

      await this.logAudit({
        schoolId, operation: 'WEBHOOK',
        transactionId: transaction.transactionId,
        durationMs: Date.now() - startMs,
        success: true,
        requestPayload: parsedBody
      });

      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      await this.logAudit({
        schoolId, operation: 'WEBHOOK',
        durationMs: Date.now() - startMs,
        success: false,
        errorMessage: error.message,
        requestPayload: parsedBody
      });
      throw error;
    }
  }
}

export default WaafiPayService;
