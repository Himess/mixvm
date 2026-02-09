import { ethers } from "hardhat";

/**
 * Configure CCTP domain mappings for cross-chain USDC transfers
 *
 * CCTP Domains:
 * - Ethereum Sepolia: 0
 * - Arbitrum Sepolia: 3
 * - Base Sepolia: 6
 *
 * Run on each chain:
 *   npx hardhat run scripts/configure-v10-cctp.ts --network baseSepolia
 *   npx hardhat run scripts/configure-v10-cctp.ts --network ethereumSepolia
 *   npx hardhat run scripts/configure-v10-cctp.ts --network arbitrumSepolia
 */

// ===== UPDATE THESE AFTER DEPLOYING v10 =====
const BRIDGES: Record<string, string> = {
  "84532": "0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1",   // Base Sepolia
  "11155111": "0xBe5233d68db3329c62958157854e1FE483d1b4c9", // Eth Sepolia
  "421614": "0x976f28253965A5bA21ad8ada897CC8383cdF206F",   // Arb Sepolia
};

// LZ EID -> CCTP Domain mapping
const CCTP_DOMAINS: Record<number, number> = {
  40245: 6,  // Base Sepolia
  40161: 0,  // Ethereum Sepolia
  40231: 3,  // Arbitrum Sepolia
};

const EIDS: Record<string, number> = {
  "84532": 40245,
  "11155111": 40161,
  "421614": 40231,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();

  console.log("=== Configure v10 CCTP Domains ===");
  console.log("Network:", network.name, "Chain ID:", chainId);
  console.log("Account:", deployer.address);

  const localBridge = BRIDGES[chainId];
  if (!localBridge || localBridge === "0x0000000000000000000000000000000000000000") {
    console.error("Bridge address not set for chain:", chainId);
    process.exit(1);
  }

  const bridge = await ethers.getContractAt("PrivateLZBridge", localBridge, deployer);

  // Set CCTP domain for each remote chain
  for (const [remoteChainId, remoteEid] of Object.entries(EIDS)) {
    if (remoteChainId === chainId) continue;

    const cctpDomain = CCTP_DOMAINS[remoteEid];
    console.log(`\nSetting CCTP domain for chain ${remoteChainId}:`);
    console.log(`  LZ EID ${remoteEid} -> CCTP domain ${cctpDomain}`);

    const tx = await bridge.setCCTPDomain(remoteEid, cctpDomain);
    console.log("  TX:", tx.hash);
    await tx.wait();
    console.log("  CCTP domain set!");

    // Verify
    const storedDomain = await bridge.cctpDomains(remoteEid);
    const isSet = await bridge.cctpDomainSet(remoteEid);
    console.log(`  Verified: domain=${storedDomain}, isSet=${isSet}`);
  }

  console.log("\n=== CCTP Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
