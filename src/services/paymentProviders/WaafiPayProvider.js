import PaymentProvider from './PaymentProvider.js';
import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * WaafiPay Payment Provider
 * Implementation for WaafiPay gateway
 */
export class WaafiPayProvider extends PaymentProvider {
  constructor(settings) {
    super(settings);
    this.merchantUid = settings.merchantUid;
    this.apiUserId = settings.apiUserId;
    this.apiKey = settings.apiKey;
    this.storeId = settings.storeId || '';
    this.hppKey = settings.hppKey;
    this.webhookSecret = settings.webhookSecret;
  }

  getProviderName() {
    return 'WAAFIPAY';
  }

  getBaseUrl() {
    return this.isSandbox()
      ? 'https://sandbox.waafipay.com/asm'
      : 'https://api.waafipay.com/asm';
  }

  buildAuth() {
    return {
      apiUserId: this.apiUserId,
      apiKey: this.apiKey,
      apiUserToken: this.apiKey // typically Waafi uses the same token for both if no JWT
    };
  }

  async makeRequest(serviceName, serviceParams) {
    const payload = {
      schemaVersion: '1.0',
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      channelName: 'WEB',
      serviceName: serviceName,
      serviceParams: serviceParams,
      auth: this.buildAuth()
    };

    const response = await axios.post(this.getBaseUrl(), payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  mapWaafiStateToInternal(state) {
    const stateMap = {
      '5001': 'COMPLETED',  // APPROVED
      '5002': 'FAILED',     // DECLINED
      '5003': 'CANCELLED',  // CANCELLED
      '5004': 'FAILED',     // FAILED
      '5005': 'FAILED',     // TIMEOUT
      '5006': 'FAILED',     // EXPIRED
      '5007': 'PENDING',    // PENDING
      '5008': 'REVERSED',   // REVERSED
      '5009': 'REFUNDED',   // REFUNDED
      '5010': 'PREAUTHORIZED',
      '5011': 'COMMITTED'
    };
    return stateMap[state] || 'FAILED';
  }

  async initializePayment(paymentData) {
    try {
      const { amount, currency, customerPhone, description, transactionId } = paymentData;

      const serviceParams = {
        merchantUid: this.merchantUid,
        apiUserId: this.apiUserId,
        apiKey: this.apiKey,
        paymentMethod: 'mwallet_account',
        payerInfo: {
          accountNo: customerPhone
        },
        transactionInfo: {
          referenceId: transactionId,
          invoiceId: transactionId,
          amount: this.formatAmount(amount),
          currency: currency || 'USD',
          description: description || 'School fee payment'
        }
      };

      const rawResponse = await this.makeRequest('API_PURCHASE', serviceParams);

      const isSuccess = rawResponse.responseCode === '2001' && rawResponse.state === '5001';

      return {
        success: isSuccess || rawResponse.state === '5007', // pending is still success for initiation
        providerTransactionId: rawResponse.issuerTransactionId,
        status: this.mapWaafiStateToInternal(rawResponse.state),
        waafiState: rawResponse.state,
        merchantCharges: rawResponse.merchantCharges || 0,
        rawResponse: rawResponse
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'FAILED',
        rawResponse: error.response?.data
      };
    }
  }

  async verifyPayment(transactionId) {
    // WaafiPay doesn't have a direct query endpoint by default, typically relies on webhooks.
    // However, some variants allow querying via API_PURCHASE with same reference.
    // For now, we return pending and rely on webhook.
    return {
      success: true,
      status: 'PENDING',
      rawResponse: { note: 'Status query relies on webhooks in WaafiPay' }
    };
  }

  verifyWebhookSignature(webhookData, signature) {
    if (!this.webhookSecret) {
      return true; // if no secret configured
    }

    const payload = typeof webhookData === 'string'
      ? webhookData
      : JSON.stringify(webhookData);

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async processWebhook(webhookData, signature) {
    // In WaafiPay, the webhook often contains the referenceId, state, issuerTransactionId
    const { referenceId, state, issuerTransactionId, merchantCharges } = webhookData;

    const internalStatus = this.mapWaafiStateToInternal(state);
    const isSuccess = internalStatus === 'COMPLETED';

    return {
      success: isSuccess,
      transactionId: referenceId,
      providerTransactionId: issuerTransactionId,
      status: internalStatus,
      merchantCharges: merchantCharges,
      rawData: webhookData
    };
  }

  async refundPayment(transactionId, amount, reason) {
    return this.reversalPayment(transactionId);
  }

  async reversalPayment(transactionId) {
    try {
      const serviceParams = {
        merchantUid: this.merchantUid,
        apiUserId: this.apiUserId,
        apiKey: this.apiKey,
        referenceId: transactionId,
        transactionId: transactionId,
        description: 'Reversal'
      };

      const rawResponse = await this.makeRequest('API_REVERSAL', serviceParams);

      const isSuccess = rawResponse.responseCode === '2001' && rawResponse.state === '5008';

      return {
        success: isSuccess,
        providerTransactionId: rawResponse.issuerTransactionId,
        status: this.mapWaafiStateToInternal(rawResponse.state),
        waafiState: rawResponse.state,
        rawResponse: rawResponse
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rawResponse: error.response?.data
      };
    }
  }

  async preAuthorize(paymentData) {
    try {
      const { amount, currency, customerPhone, description, transactionId } = paymentData;

      const serviceParams = {
        merchantUid: this.merchantUid,
        apiUserId: this.apiUserId,
        apiKey: this.apiKey,
        paymentMethod: 'mwallet_account',
        payerInfo: {
          accountNo: customerPhone
        },
        transactionInfo: {
          referenceId: transactionId,
          invoiceId: transactionId,
          amount: this.formatAmount(amount),
          currency: currency || 'USD',
          description: description || 'School fee preauth'
        }
      };

      const rawResponse = await this.makeRequest('API_PREAUTHORIZE', serviceParams);

      const isSuccess = rawResponse.responseCode === '2001' && rawResponse.state === '5010';

      return {
        success: isSuccess,
        providerTransactionId: rawResponse.issuerTransactionId,
        preAuthRef: rawResponse.issuerTransactionId,
        status: this.mapWaafiStateToInternal(rawResponse.state),
        waafiState: rawResponse.state,
        rawResponse: rawResponse
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'FAILED',
        rawResponse: error.response?.data
      };
    }
  }

  async commitPreAuth(transactionId, amount, description) {
    try {
      const serviceParams = {
        merchantUid: this.merchantUid,
        apiUserId: this.apiUserId,
        apiKey: this.apiKey,
        transactionId: transactionId,
        referenceId: transactionId,
        amount: this.formatAmount(amount),
        description: description || 'Commit preauth'
      };

      const rawResponse = await this.makeRequest('API_PREAUTHORIZE_COMMIT', serviceParams);

      const isSuccess = rawResponse.responseCode === '2001' && rawResponse.state === '5011';

      return {
        success: isSuccess,
        providerTransactionId: rawResponse.issuerTransactionId,
        status: this.mapWaafiStateToInternal(rawResponse.state),
        waafiState: rawResponse.state,
        rawResponse: rawResponse
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'FAILED',
        rawResponse: error.response?.data
      };
    }
  }

  async cancelPreAuth(transactionId, description) {
    try {
      const serviceParams = {
        merchantUid: this.merchantUid,
        apiUserId: this.apiUserId,
        apiKey: this.apiKey,
        transactionId: transactionId,
        referenceId: transactionId,
        description: description || 'Cancel preauth'
      };

      const rawResponse = await this.makeRequest('API_PREAUTHORIZE_CANCEL', serviceParams);

      const isSuccess = rawResponse.responseCode === '2001' && rawResponse.state === '5003';

      return {
        success: isSuccess,
        providerTransactionId: rawResponse.issuerTransactionId,
        status: this.mapWaafiStateToInternal(rawResponse.state),
        waafiState: rawResponse.state,
        rawResponse: rawResponse
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'FAILED',
        rawResponse: error.response?.data
      };
    }
  }

  async getTransactionStatus(transactionId) {
    return this.verifyPayment(transactionId);
  }

  async getPaymentInstructions(paymentData) {
    return {
      type: 'WAAFIPAY',
      instructions: `Please complete the payment via the WaafiPay prompt sent to your phone.`,
      merchantId: this.merchantUid,
      amount: paymentData.amount
    };
  }

  formatAmount(amount) {
    return Math.round(amount * 100) / 100;
  }
}

export default WaafiPayProvider;
