/**
 * FHEARC CCTP Message Relayer
 *
 * Monitors Arc Testnet for cross-chain transfer events and relays them to destination chains.
 *
 * Flow:
 * 1. Listen for CrossChainTransferInitiated events on Arc
 * 2. Extract message hash from event
 * 3. Fetch attestation from Circle API
 * 4. Call receiveMessage on destination chain
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { getAttestation } = require('./circle');

// Configuration
const CONFIG = {
  arc: {
    rpc: process.env.ARC_RPC_URL || 'https://arc-testnet.drpc.org',
    chainId: 5042002,
    domain: 26,
    cctpSource: '0x524212d086103566D91E37c8fF493598325E8d3F',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  baseSepolia: {
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    domain: 6,
    cctpDestination: '0xF7edaD804760cfDD4050ca9623BFb421Cc2Fe2cf',
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
  },
};

// ABIs
const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) external returns (bool)',
  'event MessageSent(bytes message)',
];

const CCTP_SOURCE_ABI = [
  'event CrossChainTransferInitiated(uint64 indexed nonce, uint32 indexed destinationDomain, bytes32 recipientCommitment, uint256 amount, bytes32 nullifier)',
];

// Private key from environment or hardcoded for testing
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

class Relayer {
  constructor() {
    // Source chain (Arc)
    this.arcProvider = new ethers.JsonRpcProvider(CONFIG.arc.rpc, CONFIG.arc.chainId);
    this.arcWallet = new ethers.Wallet(PRIVATE_KEY, this.arcProvider);
    this.sourceContract = new ethers.Contract(CONFIG.arc.cctpSource, CCTP_SOURCE_ABI, this.arcProvider);
    this.arcMessageTransmitter = new ethers.Contract(CONFIG.arc.messageTransmitter, MESSAGE_TRANSMITTER_ABI, this.arcProvider);

    // Destination chain (Base Sepolia)
    this.baseProvider = new ethers.JsonRpcProvider(CONFIG.baseSepolia.rpc, CONFIG.baseSepolia.chainId);
    this.baseWallet = new ethers.Wallet(PRIVATE_KEY, this.baseProvider);
    this.baseMessageTransmitter = new ethers.Contract(
      CONFIG.baseSepolia.messageTransmitter,
      MESSAGE_TRANSMITTER_ABI,
      this.baseWallet
    );
  }

  async start() {
    console.log('========================================');
    console.log('FHEARC CCTP Relayer Started');
    console.log('========================================');
    console.log('Arc RPC:', CONFIG.arc.rpc);
    console.log('Base Sepolia RPC:', CONFIG.baseSepolia.rpc);
    console.log('Relayer address:', this.arcWallet.address);
    console.log('========================================');

    // Listen for cross-chain transfer events
    console.log('\nListening for CrossChainTransferInitiated events...');
    
    this.sourceContract.on('CrossChainTransferInitiated', async (nonce, destinationDomain, recipientCommitment, amount, nullifier, event) => {
      console.log('\n========================================');
      console.log('New Cross-Chain Transfer Detected!');
      console.log('========================================');
      console.log('Nonce:', nonce.toString());
      console.log('Destination Domain:', destinationDomain.toString());
      console.log('Recipient Commitment:', recipientCommitment);
      console.log('Amount:', ethers.formatEther(amount), 'USDC');
      console.log('Nullifier:', nullifier);
      console.log('TX:', event.transactionHash);

      try {
        await this.relayMessage(event.transactionHash, destinationDomain);
      } catch (error) {
        console.error('Relay failed:', error.message);
      }
    });
  }

  async relayMessage(txHash, destinationDomain) {
    console.log('\n--- Relaying Message ---');

    // 1. Get the transaction receipt
    const receipt = await this.arcProvider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error('Transaction receipt not found');
    }

    // 2. Find MessageSent event from MessageTransmitter
    let message = null;
    const messageSentTopic = ethers.id('MessageSent(bytes)');
    
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === CONFIG.arc.messageTransmitter.toLowerCase() &&
          log.topics[0] === messageSentTopic) {
        // Decode the message
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['bytes'], log.data);
        message = decoded[0];
        break;
      }
    }

    if (!message) {
      throw new Error('MessageSent event not found in transaction');
    }

    console.log('Message found, length:', message.length);

    // 3. Calculate message hash
    const messageHash = ethers.keccak256(message);
    console.log('Message hash:', messageHash);

    // 4. Get attestation from Circle
    console.log('Fetching attestation from Circle...');
    const attestation = await getAttestation(messageHash);
    console.log('Attestation received!');

    // 5. Relay to destination
    if (destinationDomain.toString() === CONFIG.baseSepolia.domain.toString()) {
      console.log('Relaying to Base Sepolia...');
      
      const tx = await this.baseMessageTransmitter.receiveMessage(message, attestation, {
        gasLimit: 500000,
      });
      
      console.log('Relay TX sent:', tx.hash);
      const relayReceipt = await tx.wait();
      console.log('Relay TX confirmed! Block:', relayReceipt.blockNumber);
      console.log('Message successfully relayed!');
    } else {
      console.log('Unknown destination domain:', destinationDomain.toString());
    }
  }
}

// Main
async function main() {
  const relayer = new Relayer();
  await relayer.start();

  // Keep process running
  process.on('SIGINT', () => {
    console.log('\nShutting down relayer...');
    process.exit(0);
  });
}

main().catch(console.error);
