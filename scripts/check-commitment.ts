import { ethers } from "hardhat";

/**
 * Check if a commitment exists on the bridge
 */

const BRIDGES = {
  baseSepolia: "0x6ed1171a2713d2c494c737F9c89cb93ae4423b69",
  ethSepolia: "0xb11CC9D1d5d61d09A30C2CDF3Fdb7A1d905a2c6C",
};

// The commitment we sent in cross-chain transfer
const COMMITMENT = "0x83cb720f1a1e316eca6128637755ee304dbb7b75ac5bc8ac3c738faf50d21ca6";

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
