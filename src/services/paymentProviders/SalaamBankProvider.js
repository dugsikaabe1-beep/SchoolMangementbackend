import PaymentProvider from './PaymentProvider.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Salaam Bank Payment Provider
 * Implementation for Salaam Bank payment service
 */
export class SalaamBankProvider extends PaymentProvider {
  constructor(settings) {
    super(settings);
    this.merchantId = settings.merchantId;
    this.clientId = settings.clientId;
    this.clientSecret = settings.clientSecret;
    this.apiKey = settings.apiKey;
    this.secretKey = settings.secretKey;
    this.webhookSecret = settings.webhookSecret;
  }

  getProviderName() {
    return 'SALAAM_BANK';
  }

  getBaseUrl() {
    return this.isSandbox()
      ? 'https://sandbox.salaambank.com/api/v1'
      : 'https://api.salaambank.com/api/v1';
  }

  async initializePayment(paymentData) {
    try {
      const { amount, currency, customerPhone, description, transactionId } = paymentData;
      
      const payload = {
        merchant_id: this.merchantId,
        client_id: this.clientId,
        amount: this.formatAmount(amount),
        currency: currency || 'USD',
        customer_phone: customerPhone,
        description: description || 'School fee payment',
        reference: transactionId,
        redirect_url: this.settings.callbackUrl,
        webhook_url: this.settings.callbackUrl,
        metadata: paymentData.metadata || {}
      };

      const headers = await this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payments/create`,
        payload,
        { headers }
      );

      return {
        success: true,
        providerTransactionId: response.data.payment_id,
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
      const headers = await this.getHeaders({});
      
      const response = await axios.get(
        `${this.getBaseUrl()}/payments/${transactionId}`,
        { headers }
      );

      const isSuccess = response.data.status === 'SUCCESS' || response.data.status === 'COMPLETED' || response.data.status === 'PAID';
      
      return {
        success: isSuccess,
        status: isSuccess ? 'COMPLETED' : response.data.status,
        amount: response.data.amount,
        providerTransactionId: response.data.payment_id,
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

    const { reference, status, amount } = webhookData;
    
    const isSuccess = status === 'SUCCESS' || status === 'COMPLETED' || status === 'PAID';

    return {
      success: isSuccess,
      transactionId: reference,
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
        payment_id: transactionId,
        amount: this.formatAmount(amount),
        reason: reason
      };

      const headers = await this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/payments/refund`,
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
      type: 'BANK_TRANSFER',
      instructions: `Transfer ${amount} to Salaam Bank account. Merchant ID: ${this.merchantId}. Reference: ${paymentData.transactionId}`,
      merchantId: this.merchantId,
      amount: amount
    };
  }

  formatAmount(amount) {
    return Math.round(amount * 100) / 100;
  }

  async getHeaders(payload) {
    const accessToken = await this.getAccessToken();
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(payload, timestamp);

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Timestamp': timestamp,
      'X-Signature': signature
    };
  }

  async getAccessToken() {
    try {
      const response = await axios.post(
        `${this.getBaseUrl()}/auth/token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials'
        }
      );
      return response.data.access_token;
    } catch (error) {
      console.error('Error getting access token:', error);
      return this.apiKey;
    }
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

export default SalaamBankProvider;
