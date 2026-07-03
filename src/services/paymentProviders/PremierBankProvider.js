import PaymentProvider from './PaymentProvider.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Premier Bank Payment Provider
 * Implementation for Premier Bank payment service
 */
export class PremierBankProvider extends PaymentProvider {
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
    return 'PREMIER_BANK';
  }

  getBaseUrl() {
    return this.isSandbox()
      ? 'https://sandbox.premierbank.so/api/v1'
      : 'https://api.premierbank.so/api/v1';
  }

  async initializePayment(paymentData) {
    try {
      const { amount, currency, customerPhone, customerEmail, description, transactionId } = paymentData;
      
      const payload = {
        merchantId: this.merchantId,
        clientId: this.clientId,
        amount: this.formatAmount(amount),
        currency: currency || 'USD',
        customerPhone: customerPhone,
        customerEmail: customerEmail,
        description: description || 'School fee payment',
        transactionReference: transactionId,
        successUrl: this.settings.callbackUrl,
        failUrl: this.settings.callbackUrl,
        webhookUrl: this.settings.callbackUrl,
        metadata: paymentData.metadata || {}
      };

      const headers = await this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/checkout/create`,
        payload,
        { headers }
      );

      return {
        success: true,
        providerTransactionId: response.data.transactionId,
        paymentUrl: response.data.checkoutUrl,
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
        `${this.getBaseUrl()}/transactions/${transactionId}`,
        { headers }
      );

      const isSuccess = response.data.status === 'SUCCESS' || response.data.status === 'COMPLETED' || response.data.status === 'APPROVED';
      
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

    const { transactionReference, status, amount } = webhookData;
    
    const isSuccess = status === 'SUCCESS' || status === 'COMPLETED' || status === 'APPROVED';

    return {
      success: isSuccess,
      transactionId: transactionReference,
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

      const headers = await this.getHeaders(payload);
      
      const response = await axios.post(
        `${this.getBaseUrl()}/transactions/refund`,
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
      type: 'BANK_TRANSFER',
      instructions: `Transfer ${amount} to Premier Bank account. Merchant ID: ${this.merchantId}. Reference: ${paymentData.transactionId}`,
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
    const nonce = crypto.randomUUID();
    const signature = this.generateSignature(payload, timestamp, nonce);

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'API-Key': this.apiKey
    };
  }

  async getAccessToken() {
    try {
      const response = await axios.post(
        `${this.getBaseUrl()}/oauth/token`,
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

export default PremierBankProvider;
