import EVCPlusProvider from './EVCPlusProvider.js';
import ZaadProvider from './ZaadProvider.js';
import SahalProvider from './SahalProvider.js';
import SalaamBankProvider from './SalaamBankProvider.js';
import PremierBankProvider from './PremierBankProvider.js';
import PaymentProvider from './PaymentProvider.js';

/**
 * Payment Provider Factory
 * Creates the appropriate payment provider instance based on provider type
 */
export class PaymentProviderFactory {
  static providers = {
    EVC_PLUS: EVCPlusProvider,
    ZAAD: ZaadProvider,
    SAHAL: SahalProvider,
    SALAAM_BANK: SalaamBankProvider,
    PREMIER_BANK: PremierBankProvider
  };

  /**
   * Create a payment provider instance
   * @param {string} providerType Provider type (EVC_PLUS, ZAAD, etc.)
   * @param {Object} settings Provider settings
   * @returns {PaymentProvider} Provider instance
   */
  static createProvider(providerType, settings) {
    const ProviderClass = this.providers[providerType];
    
    if (!ProviderClass) {
      throw new Error(`Payment provider ${providerType} not supported`);
    }

    return new ProviderClass(settings);
  }

  /**
   * Get all supported provider types
   * @returns {string[]} Array of provider types
   */
  static getSupportedProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Check if a provider is supported
   * @param {string} providerType Provider type
   * @returns {boolean} True if supported
   */
  static isProviderSupported(providerType) {
    return !!this.providers[providerType];
  }
}

export {
  PaymentProvider,
  EVCPlusProvider,
  ZaadProvider,
  SahalProvider,
  SalaamBankProvider,
  PremierBankProvider
};

export default PaymentProviderFactory;
