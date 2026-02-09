import { ethers } from "hardhat";

/**
 * Test deposit on LayerZero Bridge
 */

const BRIDGES = {
  baseSepolia: "0x6ed1171a2713d2c494c737F9c89cb93ae4423b69",
  ethSepolia: "0xb11CC9D1d5d61d09A30C2CDF3Fdb7A1d905a2c6C",
};

const USDC = {
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  ethSepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Test LayerZero Bridge Deposit ===");
  console.log("Account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const isBaseSepolia = network.chainId === 84532n;

  const bridgeAddress = isBaseSepolia ? BRIDGES.baseSepolia : BRIDGES.ethSepolia;
  const usdcAddress = isBaseSepolia ? USDC.baseSepolia : USDC.ethSepolia;

  console.log("Network:", isBaseSepolia ? "Base Sepolia" : "Ethereum Sepolia");
  console.log("Bridge:", bridgeAddress);
  console.log("USDC:", usdcAddress);

  // Get contracts
  const bridge = await ethers.getContractAt("PrivateLZBridge", bridgeAddress, deployer);
  const usdc = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)",
     "function approve(address,uint256) returns (bool)",
     "function allowance(address,address) view returns (uint256)"],
    usdcAddress,
    deployer
  );

  // Check balances
  const usdcBalance = await usdc.balanceOf(deployer.address);
  console.log("\nUSDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

  const bridgeBalance = await usdc.balanceOf(bridgeAddress);
  console.log("Bridge USDC Balance:", ethers.formatUnits(bridgeBalance, 6), "USDC");

  // Get tree info
  const treeInfo = await bridge.getTreeInfo();
  console.log("\nMerkle Tree:");
  console.log("  Next leaf index:", treeInfo[0].toString());
  console.log("  Max size:", treeInfo[1].toString());
  console.log("  Current root:", treeInfo[2]);

  if (usdcBalance < 1000000n) { // < 1 USDC
    console.log("\n⚠️ Not enough USDC to test deposit");
    console.log("Get USDC from Circle faucet: https://faucet.circle.com/");
    return;
  }

  // Test deposit
  const depositAmount = 1000000n; // 1 USDC
  const testCommitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment-" + Date.now()));

  console.log("\n--- Testing Deposit ---");
  console.log("Amount:", ethers.formatUnits(depositAmount, 6), "USDC");
  console.log("Commitment:", testCommitment);

  // Approve
  console.log("\nApproving USDC...");
  const approveTx = await usdc.approve(bridgeAddress, depositAmount);
  await approveTx.wait();
  console.log("✅ Approved");

  // Deposit
  console.log("\nDepositing...");
  const depositTx = await bridge.deposit(depositAmount, testCommitment);
  console.log("TX:", depositTx.hash);
  const receipt = await depositTx.wait();
  console.log("✅ Deposit successful!");

  // Check updated tree
  const newTreeInfo = await bridge.getTreeInfo();
  console.log("\nUpdated Merkle Tree:");
  console.log("  Next leaf index:", newTreeInfo[0].toString());
  console.log("  Current root:", newTreeInfo[2]);

  // Check commitment exists
  const exists = await bridge.commitmentExists(testCommitment);
  console.log("  Commitment exists:", exists);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
