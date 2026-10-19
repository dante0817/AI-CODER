'use strict';

function manualOnlyProviderEligible(requestedProvider, providerName, connected) {
  return Boolean(connected) && String(requestedProvider || 'auto') === String(providerName || '');
}

module.exports = { manualOnlyProviderEligible };
