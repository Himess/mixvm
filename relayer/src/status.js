/**
 * Relayer Status Check
 * Shows recent cross-chain transfers and their relay status.
 */

require('dotenv').config();
const { ethers } = require('ethers');

const CONFIG = {
  arc: {
    rpc: process.env.ARC_RPC_URL || 'https://arc-testnet.drpc.org',
    chainId: 5042002,
    cctpSource: '0x524212d086103566D91E37c8fF493598325E8d3F',
  },
  baseSepolia: {
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    cctpDestination: '0xF7edaD804760cfDD4050ca9623BFb421Cc2Fe2cf',
  },
};

const CCTP_SOURCE_ABI = [
  'event CrossChainTransferInitiated(uint64 indexed nonce, uint32 indexed destinationDomain, bytes32 recipientCommitment, uint256 amount, bytes32 nullifier)',
];

const CCTP_DEST_ABI = [
  'event CrossChainTransferReceived(uint64 indexed nonce, uint32 indexed sourceDomain, bytes32 recipientCommitment, uint256 amount)',
];

async function main() {
  console.log('========================================');
  console.log('FHEARC Relayer - Status Check');
  console.log('========================================\n');

  const arcProvider = new ethers.JsonRpcProvider(CONFIG.arc.rpc, CONFIG.arc.chainId);
  const baseProvider = new ethers.JsonRpcProvider(CONFIG.baseSepolia.rpc, CONFIG.baseSepolia.chainId);

  const sourceContract = new ethers.Contract(CONFIG.arc.cctpSource, CCTP_SOURCE_ABI, arcProvider);
  const destContract = new ethers.Contract(CONFIG.baseSepolia.cctpDestination, CCTP_DEST_ABI, baseProvider);

  // Get recent blocks
  const arcBlock = await arcProvider.getBlockNumber();
  const baseBlock = await baseProvider.getBlockNumber();

  console.log('Current blocks:');
  console.log('  Arc Testnet:', arcBlock);
  console.log('  Base Sepolia:', baseBlock);

  // Look back ~1000 blocks (approximately 1 hour on both chains)
  const lookback = 1000;

  console.log('\n--- Recent Transfers (last ~1000 blocks) ---\n');

  // Get initiated transfers
  const initiatedFilter = sourceContract.filters.CrossChainTransferInitiated();
  const initiatedEvents = await sourceContract.queryFilter(
    initiatedFilter,
    Math.max(0, arcBlock - lookback),
    arcBlock
  );

  if (initiatedEvents.length === 0) {
    console.log('No cross-chain transfers found in recent blocks.');
    return;
  }

  // Get received transfers
  const receivedFilter = destContract.filters.CrossChainTransferReceived();
  const receivedEvents = await destContract.queryFilter(
    receivedFilter,
    Math.max(0, baseBlock - lookback),
    baseBlock
  );

  // Build set of received nonces
  const receivedNonces = new Set(receivedEvents.map(e => e.args.nonce.toString()));

  console.log(`Found ${initiatedEvents.length} initiated transfer(s):`);
  console.log('');

  for (const event of initiatedEvents) {
    const nonce = event.args.nonce.toString();
    const amount = ethers.formatEther(event.args.amount);
    const destDomain = event.args.destinationDomain.toString();
    const isRelayed = receivedNonces.has(nonce);

    const status = isRelayed ? '[RELAYED]' : '[PENDING]';
    const statusColor = isRelayed ? '\x1b[32m' : '\x1b[33m'; // Green or Yellow

    console.log(`${statusColor}${status}\x1b[0m Nonce: ${nonce}`);
    console.log(`        Amount: ${amount} USDC`);
    console.log(`        Destination Domain: ${destDomain}`);
    console.log(`        TX: ${event.transactionHash}`);
    console.log('');
  }

  // Summary
  const pending = initiatedEvents.length - receivedNonces.size;
  console.log('========================================');
  console.log(`Total: ${initiatedEvents.length} transfers`);
  console.log(`  Relayed: ${receivedNonces.size}`);
  console.log(`  Pending: ${pending}`);
  console.log('========================================');

  if (pending > 0) {
    console.log('\nTo relay pending messages, run: npm start');
  }
}

main().catch(console.error);
