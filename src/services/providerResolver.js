/**
 * Resolve provider configuration (only push and email remain)
 */
export const resolveProvider = async ({ tenantId, schoolId, channel }) => {
  // Fallbacks based on environment variables
  if (channel === 'push') {
    if (process.env.FCM_SERVER_KEY) return { providerKey: 'fcm', providerType: 'push' };
  }

  return null;
};

export default { resolveProvider };
