/**
 * Manual Message Relayer
 * Usage: node relay-message.js <arc_tx_hash>
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { getAttestation } = require('./circle');

const CONFIG = {
  arc: {
    rpc: process.env.ARC_RPC_URL || 'https://arc-testnet.drpc.org',
    chainId: 5042002,
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  baseSepolia: {
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
  },
};

const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) external returns (bool)',
];

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

async function main() {
  const txHash = process.argv[2];
  
  if (!txHash) {
    console.log('Usage: node relay-message.js <arc_tx_hash>');
    console.log('Example: node relay-message.js 0x1234...');
    process.exit(1);
  }

  console.log('========================================');
  console.log('Manual CCTP Message Relay');
  console.log('========================================');
  console.log('Arc TX:', txHash);

  // Get receipt from Arc
  const arcProvider = new ethers.JsonRpcProvider(CONFIG.arc.rpc, CONFIG.arc.chainId);
  const receipt = await arcProvider.getTransactionReceipt(txHash);
  
  if (!receipt) {
    throw new Error('Transaction not found');
  }

  console.log('Block:', receipt.blockNumber);
  console.log('Status:', receipt.status === 1 ? 'Success' : 'Failed');

  // Find MessageSent event
  const messageSentTopic = ethers.id('MessageSent(bytes)');
  let message = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === CONFIG.arc.messageTransmitter.toLowerCase() &&
        log.topics[0] === messageSentTopic) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['bytes'], log.data);
      message = decoded[0];
      break;
    }
  }

  if (!message) {
    console.log('\nNo MessageSent event found. This may be a local transfer, not cross-chain.');
    process.exit(0);
  }

  console.log('\nMessage found, length:', message.length, 'bytes');

  // Calculate hash
  const messageHash = ethers.keccak256(message);
  console.log('Message hash:', messageHash);

  // Get attestation
  console.log('\nFetching attestation from Circle...');
  console.log('This may take a few minutes...\n');
  
  const attestation = await getAttestation(messageHash);
  console.log('Attestation received!');
  console.log('Attestation:', attestation.slice(0, 50) + '...');

  // Relay to Base Sepolia
  console.log('\nRelaying to Base Sepolia...');
  const baseProvider = new ethers.JsonRpcProvider(CONFIG.baseSepolia.rpc, CONFIG.baseSepolia.chainId);
  const baseWallet = new ethers.Wallet(PRIVATE_KEY, baseProvider);
  const baseTransmitter = new ethers.Contract(CONFIG.baseSepolia.messageTransmitter, MESSAGE_TRANSMITTER_ABI, baseWallet);

  const tx = await baseTransmitter.receiveMessage(message, attestation, {
    gasLimit: 500000,
  });

  console.log('TX sent:', tx.hash);
  const relayReceipt = await tx.wait();
  
  console.log('\n========================================');
  console.log('MESSAGE RELAYED SUCCESSFULLY!');
  console.log('========================================');
  console.log('Base Sepolia TX:', tx.hash);
  console.log('Block:', relayReceipt.blockNumber);
  console.log('========================================');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
