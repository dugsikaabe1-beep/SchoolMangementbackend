import PaymentProvider from './PaymentProvider.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Sahal Payment Provider
 * Implementation for Sahal mobile money payment service
 */
export class SahalProvider extends PaymentProvider {
  constructor(settings) {
    super(settings);
    this.merchantId = settings.merchantId;
    this.merchantNumber = settings.merchantNumber;
    this.apiKey = settings.apiKey;
    this.secretKey = settings.secretKey;
    this.webhookSecret = settings.webhookSecret;
  }

  getProviderName() {
    return 'SAHAL';
  }

  getBaseUrl() {
    return this.isSandbox()
      ? 'https://sandbox.sahal.com/api/v2'
      : 'https://api.sahal.com/api/v2';
  }

  async initializePayment(paymentData) {
    try {
      const { amount, currency, customerPhone, description, transactionId } = paymentData;
      
      const payload = {
        merchantId: this.merchantId,
        merchantNumber: this.merchantNumber,
        amount: this.formatAmount(amount),
        currency: currency || 'USD',
        customerMsisdn: customerPhone,
        description: description || 'School fee payment',
        orderId: transactionId,
        returnUrl: this.settings.callbackUrl,
        notifyUrl: this.settings.callbackUrl,
        metadata: paymentData.metadata || {}
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/transactions/initiate`,
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
      const headers = this.getHeaders({});
      
      const response = await axios.get(
        `${this.getBaseUrl()}/transactions/${transactionId}`,
        { headers }
      );

      const isSuccess = response.data.status === 'SUCCESS' || response.data.status === 'COMPLETED';
      
      return {
        success: isSuccess,
        status: isSuccess ? 'COMPLETED' : response.data.status,
        amount: response.data.amount,
        providerTransactionId: response.data.transactionId,
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

    const { orderId, status, amount } = webhookData;
    
    const isSuccess = status === 'SUCCESS' || status === 'COMPLETED';

    return {
      success: isSuccess,
      transactionId: orderId,
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
      .createHmac('sha512', this.webhookSecret)
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
        transactionId: transactionId,
        amount: this.formatAmount(amount),
        reason: reason
      };

      const headers = this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/transactions/refund`,
        payload,
        { headers }
      );

      return {
        success: true,
        refundTransactionId: response.data.refundId,
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
      instructions: `Dial *999# from ${customerPhone}, select Pay Merchant, enter Merchant ID: ${this.merchantId}, enter Amount: ${amount}, and confirm.`,
      merchantId: this.merchantId,
      amount: amount
    };
  }

  formatAmount(amount) {
    return Math.round(amount * 100) / 100;
  }

  getHeaders(payload) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = this.generateSignature(payload, timestamp, nonce);

    return {
      'Content-Type': 'application/json',
      'X-Merchant-Id': this.merchantId,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'API-Key': this.apiKey
    };
  }

  generateSignature(payload, timestamp, nonce) {
    const data = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    
    return crypto
      .createHmac('sha512', this.secretKey || this.apiKey)
      .update(data + timestamp + nonce)
      .digest('hex');
  }
}

export default SahalProvider;
