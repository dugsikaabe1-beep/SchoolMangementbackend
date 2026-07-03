import PaymentProvider from './PaymentProvider.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * EVC Plus Payment Provider
 * Implementation for EVC Plus mobile money payment service
 */
export class EVCPlusProvider extends PaymentProvider {
  constructor(settings) {
    super(settings);
    this.merchantId = settings.merchantId;
    this.merchantNumber = settings.merchantNumber;
    this.apiKey = settings.apiKey;
    this.secretKey = settings.secretKey;
    this.webhookSecret = settings.webhookSecret;
  }

  getProviderName() {
    return 'EVC_PLUS';
  }

  getBaseUrl() {
    return this.isSandbox()
      ? 'https://sandbox.evcplus.com/api'
      : 'https://api.evcplus.com/api';
  }

  async initializePayment(paymentData) {
    try {
      const { amount, currency, customerPhone, description, transactionId } = paymentData;
      
      const payload = {
        merchantId: this.merchantId,
        merchantNumber: this.merchantNumber,
        amount: this.formatAmount(amount),
        currency: currency || 'USD',
        customerPhone: customerPhone,
        description: description || 'School fee payment',
        transactionId: transactionId,
        callbackUrl: this.settings.callbackUrl,
        metadata: paymentData.metadata || {}
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payment/initiate`,
        payload,
        { headers }
      );

      return {
        success: true,
        providerTransactionId: response.data.transactionId,
        paymentUrl: response.data.paymentUrl,
        status: 'PENDING',
        rawResponse: response.data
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
    try {
      const payload = {
        merchantId: this.merchantId,
        transactionId: transactionId
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payment/verify`,
        payload,
        { headers }
      );

      const isSuccess = response.data.status === 'COMPLETED';
      
      return {
        success: isSuccess,
        status: isSuccess ? 'COMPLETED' : 'PENDING',
        amount: response.data.amount,
        providerTransactionId: response.data.providerTransactionId,
        rawResponse: response.data
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

  async processWebhook(webhookData, signature) {
    const isValid = this.verifyWebhookSignature(webhookData, signature);
    
    if (!isValid) {
      throw new Error('Invalid webhook signature');
    }

    const { transactionId, status, amount } = webhookData;
    
    const isSuccess = status === 'COMPLETED';

    return {
      success: isSuccess,
      transactionId: transactionId,
      status: isSuccess ? 'COMPLETED' : status,
      amount: amount,
      rawData: webhookData
    };
  }

  verifyWebhookSignature(webhookData, signature) {
    if (!this.webhookSecret) {
      return true;
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

  async refundPayment(transactionId, amount, reason) {
    try {
      const payload = {
        merchantId: this.merchantId,
        transactionId: transactionId,
        amount: this.formatAmount(amount),
        reason: reason
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payment/refund`,
        payload,
        { headers }
      );

      return {
        success: true,
        refundTransactionId: response.data.refundTransactionId,
        status: 'REFUNDED',
        rawResponse: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rawResponse: error.response?.data
      };
    }
  }

  async getTransactionStatus(transactionId) {
    return this.verifyPayment(transactionId);
  }

  async getPaymentInstructions(paymentData) {
    const { amount, customerPhone } = paymentData;
    
    return {
      type: 'USSD',
      instructions: `Dial *888# from ${customerPhone}, select Pay Bill, enter Merchant ID: ${this.merchantId}, enter Amount: ${amount}, and confirm.`,
      merchantId: this.merchantId,
      amount: amount
    };
  }

  formatAmount(amount) {
    return Math.round(amount * 100) / 100;
  }

  getHeaders(payload) {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(payload, timestamp);

    return {
      'Content-Type': 'application/json',
      'X-Merchant-Id': this.merchantId,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  generateSignature(payload, timestamp) {
    const data = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    
    return crypto
      .createHmac('sha256', this.secretKey || this.apiKey)
      .update(data + timestamp)
      .digest('hex');
  }
}

export default EVCPlusProvider;
