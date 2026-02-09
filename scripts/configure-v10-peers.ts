import { ethers } from "hardhat";

/**
 * Configure LayerZero peers between all 3 chains (6 directions)
 *
 * Run on each chain:
 *   npx hardhat run scripts/configure-v10-peers.ts --network baseSepolia
 *   npx hardhat run scripts/configure-v10-peers.ts --network ethereumSepolia
 *   npx hardhat run scripts/configure-v10-peers.ts --network arbitrumSepolia
 */

// ===== UPDATE THESE AFTER DEPLOYING v10 =====
const BRIDGES: Record<string, string> = {
  "84532": "0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1",   // Base Sepolia
  "11155111": "0xBe5233d68db3329c62958157854e1FE483d1b4c9", // Eth Sepolia
  "421614": "0x976f28253965A5bA21ad8ada897CC8383cdF206F",   // Arb Sepolia
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

  console.log("=== Configure v10 Peers ===");
  console.log("Network:", network.name, "Chain ID:", chainId);
  console.log("Account:", deployer.address);

  const localBridge = BRIDGES[chainId];
  if (!localBridge || localBridge === "0x0000000000000000000000000000000000000000") {
    console.error("Bridge address not set for chain:", chainId);
    process.exit(1);
  }

  const bridge = await ethers.getContractAt("PrivateLZBridge", localBridge, deployer);

  // Set peers for all other chains
  for (const [remoteChainId, remoteBridge] of Object.entries(BRIDGES)) {
    if (remoteChainId === chainId) continue;
    if (remoteBridge === "0x0000000000000000000000000000000000000000") {
      console.warn(`Skipping ${remoteChainId} - bridge not deployed yet`);
      continue;
    }

    const remoteEid = EIDS[remoteChainId];
    const peerBytes32 = ethers.zeroPadValue(remoteBridge, 32);

    console.log(`\nSetting peer for chain ${remoteChainId} (EID ${remoteEid})...`);
    console.log("  Remote bridge:", remoteBridge);
    console.log("  Peer bytes32:", peerBytes32);

    const tx = await bridge.setPeer(remoteEid, peerBytes32);
    console.log("  TX:", tx.hash);
    await tx.wait();
    console.log("  Peer set!");

    // Verify
    const storedPeer = await bridge.peers(remoteEid);
    console.log("  Verified:", storedPeer);
  }

  console.log("\n=== Peer Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
