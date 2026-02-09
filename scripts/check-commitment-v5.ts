import { ethers } from "hardhat";

/**
 * Check if a commitment exists on the bridge (v5)
 */

const BRIDGES = {
  baseSepolia: "0xe0F0925E39f1239BAE952Cf03dF3de50d8FDb1Af",
  ethSepolia: "0x6Ba359A21ef2544DC6fD8E2a93987DAE34843BE3",
};

// The commitment we sent in the latest cross-chain transfer
const COMMITMENT = "0xde05030209c5b3fa63a44e6546c6bb82991da0cc38a30852da50c29775b71bc4";

async function main() {
  const [deployer] = await ethers.getSigners();

  const network = await ethers.provider.getNetwork();
  const isBaseSepolia = network.chainId === 84532n;
  const bridgeAddress = isBaseSepolia ? BRIDGES.baseSepolia : BRIDGES.ethSepolia;

  console.log("=== Check Commitment on", isBaseSepolia ? "Base Sepolia" : "Ethereum Sepolia", "===");
  console.log("Bridge:", bridgeAddress);
  console.log("Commitment:", COMMITMENT);

  const bridge = await ethers.getContractAt("PrivateLZBridge", bridgeAddress, deployer);

  // Check if commitment exists
  const exists = await bridge.commitmentExists(COMMITMENT);
  console.log("\nCommitment exists:", exists);

  // Get tree info
  const treeInfo = await bridge.getTreeInfo();
  console.log("\nMerkle Tree:");
  console.log("  Next leaf index:", treeInfo[0].toString());
  console.log("  Max size:", treeInfo[1].toString());
  console.log("  Current root:", treeInfo[2]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
