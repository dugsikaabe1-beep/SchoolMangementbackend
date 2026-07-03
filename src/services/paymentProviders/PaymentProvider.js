/**
 * Abstract Payment Provider Class
 * Base class for all payment providers using Strategy Pattern
 */
export class PaymentProvider {
  constructor(settings) {
    if (this.constructor === PaymentProvider) {
      throw new Error('Cannot instantiate abstract PaymentProvider class');
    }
    this.settings = settings;
    this.environment = settings.environment || 'SANDBOX';
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    throw new Error('Method getProviderName() must be implemented');
  }

  /**
   * Initialize a payment
   * @param {Object} paymentData Payment data
   * @returns {Promise<Object>} Payment initialization result
   */
  async initializePayment(paymentData) {
    throw new Error('Method initializePayment() must be implemented');
  }

  /**
   * Verify a payment transaction
   * @param {string} transactionId Transaction ID to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(transactionId) {
    throw new Error('Method verifyPayment() must be implemented');
  }

  /**
   * Process webhook from payment provider
   * @param {Object} webhookData Webhook payload
   * @param {string} signature Webhook signature
   * @returns {Promise<Object>} Processed webhook result
   */
  async processWebhook(webhookData, signature) {
    throw new Error('Method processWebhook() must be implemented');
  }

  /**
   * Verify webhook signature
   * @param {Object} webhookData Webhook payload
   * @param {string} signature Webhook signature
   * @returns {boolean} Signature verification result
   */
  verifyWebhookSignature(webhookData, signature) {
    throw new Error('Method verifyWebhookSignature() must be implemented');
  }

  /**
   * Refund a payment
   * @param {string} transactionId Transaction ID to refund
   * @param {number} amount Amount to refund
   * @param {string} reason Refund reason
   * @returns {Promise<Object>} Refund result
   */
  async refundPayment(transactionId, amount, reason) {
    throw new Error('Method refundPayment() must be implemented');
  }

  /**
   * Get transaction status
   * @param {string} transactionId Transaction ID
   * @returns {Promise<Object>} Transaction status
   */
  async getTransactionStatus(transactionId) {
    throw new Error('Method getTransactionStatus() must be implemented');
  }

  /**
   * Generate payment URL or payment instructions
   * @param {Object} paymentData Payment data
   * @returns {Promise<string|Object>} Payment URL or instructions
   */
  async getPaymentInstructions(paymentData) {
    throw new Error('Method getPaymentInstructions() must be implemented');
  }

  /**
   * Format amount for the provider
   * @param {number} amount Amount to format
   * @returns {string|number} Formatted amount
   */
  formatAmount(amount) {
    return amount;
  }

  /**
   * Check if provider is in sandbox mode
   * @returns {boolean} True if sandbox
   */
  isSandbox() {
    return this.environment === 'SANDBOX';
  }

  /**
   * Get API base URL
   * @returns {string} Base URL
   */
  getBaseUrl() {
    throw new Error('Method getBaseUrl() must be implemented');
  }
}

export default PaymentProvider;
