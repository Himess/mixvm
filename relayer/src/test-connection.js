/**
 * Test Relayer Configuration
 * Verifies RPC connections and wallet setup before running the relayer.
 */

require('dotenv').config();
const { ethers } = require('ethers');

const CONFIG = {
  arc: {
    rpc: process.env.ARC_RPC_URL || 'https://arc-testnet.drpc.org',
    chainId: 5042002,
  },
  baseSepolia: {
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
  },
};

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

async function main() {
  console.log('========================================');
  console.log('FHEARC Relayer - Connection Test');
  console.log('========================================\n');

  let allGood = true;

  // Test Arc connection
  console.log('1. Testing Arc Testnet connection...');
  try {
    const arcProvider = new ethers.JsonRpcProvider(CONFIG.arc.rpc, CONFIG.arc.chainId);
    const arcBlock = await arcProvider.getBlockNumber();
    console.log('   [OK] Arc Testnet connected, block:', arcBlock);
  } catch (err) {
    console.log('   [FAIL] Arc Testnet connection failed:', err.message);
    allGood = false;
  }

  // Test Base Sepolia connection
  console.log('\n2. Testing Base Sepolia connection...');
  try {
    const baseProvider = new ethers.JsonRpcProvider(CONFIG.baseSepolia.rpc, CONFIG.baseSepolia.chainId);
    const baseBlock = await baseProvider.getBlockNumber();
    console.log('   [OK] Base Sepolia connected, block:', baseBlock);
  } catch (err) {
    console.log('   [FAIL] Base Sepolia connection failed:', err.message);
    allGood = false;
  }

  // Test wallet
  console.log('\n3. Checking relayer wallet...');
  try {
    const arcProvider = new ethers.JsonRpcProvider(CONFIG.arc.rpc, CONFIG.arc.chainId);
    const baseProvider = new ethers.JsonRpcProvider(CONFIG.baseSepolia.rpc, CONFIG.baseSepolia.chainId);

    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log('   Address:', wallet.address);

    const arcBalance = await arcProvider.getBalance(wallet.address);
    const baseBalance = await baseProvider.getBalance(wallet.address);

    console.log('   Arc balance:', ethers.formatEther(arcBalance), 'ETH');
    console.log('   Base balance:', ethers.formatEther(baseBalance), 'ETH');

    if (baseBalance === 0n) {
      console.log('   [WARN] No ETH on Base Sepolia - relayer needs gas to relay messages!');
      allGood = false;
    } else {
      console.log('   [OK] Wallet has funds for relaying');
    }
  } catch (err) {
    console.log('   [FAIL] Wallet check failed:', err.message);
    allGood = false;
  }

  // Test Circle API (if configured)
  console.log('\n4. Checking Circle API key...');
  const circleKey = process.env.CIRCLE_API_KEY;
  if (circleKey) {
    console.log('   [OK] CIRCLE_API_KEY is configured');
  } else {
    console.log('   [WARN] CIRCLE_API_KEY not set - using default testnet key');
  }

  // Summary
  console.log('\n========================================');
  if (allGood) {
    console.log('All checks passed! Ready to run relayer.');
    console.log('Run: npm start');
  } else {
    console.log('Some checks failed. Please fix the issues above.');
  }
  console.log('========================================');
}

main().catch(console.error);
