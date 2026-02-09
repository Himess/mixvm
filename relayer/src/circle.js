/**
 * Circle Attestation Service Client
 * Fetches attestations from Circle's Iris API for CCTP messages
 */

// Circle Attestation API (sandbox for testnet)
const CIRCLE_ATTESTATION_API = 'https://iris-api-sandbox.circle.com/v1/attestations';

/**
 * Get attestation for a CCTP message
 * @param {string} messageHash - The keccak256 hash of the message
 * @returns {Promise<string>} - The attestation signature
 */
async function getAttestation(messageHash) {
  const maxRetries = 30;
  const retryDelay = 10000; // 10 seconds

  console.log(`[Circle] Fetching attestation for: ${messageHash}`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
      const data = await response.json();

      if (data.status === 'complete') {
        console.log(`[Circle] Attestation received!`);
        return data.attestation;
      }

      if (data.status === 'pending_confirmations') {
        console.log(`[Circle] Attestation pending (attempt ${i + 1}/${maxRetries})`);
      } else {
        console.log(`[Circle] Status: ${data.status} (attempt ${i + 1}/${maxRetries})`);
      }

      await sleep(retryDelay);
    } catch (error) {
      console.error('[Circle] Error fetching attestation:', error.message);
      await sleep(retryDelay);
    }
  }

  throw new Error('Attestation timeout - message may not have been processed yet');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getAttestation };
