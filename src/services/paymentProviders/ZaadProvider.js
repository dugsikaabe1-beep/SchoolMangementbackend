import PaymentProvider from './PaymentProvider.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Zaad Payment Provider
 * Implementation for Zaad mobile money payment service
 */
export class ZaadProvider extends PaymentProvider {
  constructor(settings) {
    super(settings);
    this.merchantId = settings.merchantId;
    this.merchantNumber = settings.merchantNumber;
    this.apiKey = settings.apiKey;
    this.secretKey = settings.secretKey;
    this.webhookSecret = settings.webhookSecret;
  }

  getProviderName() {
    return 'ZAAD';
  }

  getBaseUrl() {
    return this.isSandbox()
      ? 'https://sandbox.zaad.com/api/v1'
      : 'https://api.zaad.com/api/v1';
  }

  async initializePayment(paymentData) {
    try {
      const { amount, currency, customerPhone, description, transactionId } = paymentData;
      
      const payload = {
        merchant_id: this.merchantId,
        merchant_number: this.merchantNumber,
        amount: this.formatAmount(amount),
        currency: currency || 'USD',
        phone_number: customerPhone,
        description: description || 'School fee payment',
        external_id: transactionId,
        callback_url: this.settings.callbackUrl,
        metadata: paymentData.metadata || {}
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payments`,
        payload,
        { headers }
      );

      return {
        success: true,
        providerTransactionId: response.data.id,
        paymentUrl: response.data.payment_url,
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
      const headers = this.getHeaders({});
      
      const response = await axios.get(
        `${this.getBaseUrl()}/payments/${transactionId}`,
        { headers }
      );

      const isSuccess = response.data.status === 'SUCCESS' || response.data.status === 'COMPLETED';
      
      return {
        success: isSuccess,
        status: isSuccess ? 'COMPLETED' : response.data.status,
        amount: response.data.amount,
        providerTransactionId: response.data.id,
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

    const { external_id, status, amount } = webhookData;
    
    const isSuccess = status === 'SUCCESS' || status === 'COMPLETED';

    return {
      success: isSuccess,
      transactionId: external_id,
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
        amount: this.formatAmount(amount),
        reason: reason
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payments/${transactionId}/refund`,
        payload,
        { headers }
      );

      return {
        success: true,
        refundTransactionId: response.data.refund_id,
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
      instructions: `Dial *727# from ${customerPhone}, select Send Money, enter Merchant Number: ${this.merchantNumber}, enter Amount: ${amount}, and confirm.`,
      merchantNumber: this.merchantNumber,
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

export default ZaadProvider;
