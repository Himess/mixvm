import { ethers } from "hardhat";

/**
 * Deploy TransferVerifier and WithdrawVerifier to Arb Sepolia or Eth Sepolia
 *
 * Base Sepolia already has verifiers deployed:
 * - TransferVerifier: 0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B
 * - WithdrawVerifier: 0x4aC6108858A2ba9C715d3E1694d413b01919A043
 *
 * Run:
 *   npx hardhat run scripts/deploy-verifiers.ts --network arbitrumSepolia
 *   npx hardhat run scripts/deploy-verifiers.ts --network ethereumSepolia
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=== Verifier Deployment ===");
  console.log("Network:", network.name, "Chain ID:", network.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy TransferVerifier (from PrivateTransferVerifier.sol, contract name: TransferVerifier)
  console.log("\n1. Deploying TransferVerifier...");
  const TransferVerifier = await ethers.getContractFactory("TransferVerifier");
  const transferVerifier = await TransferVerifier.deploy();
  await transferVerifier.waitForDeployment();
  const transferVerifierAddress = await transferVerifier.getAddress();
  console.log("   TransferVerifier deployed to:", transferVerifierAddress);

  // Deploy WithdrawVerifier (from WithdrawVerifier.sol, contract name: WithdrawVerifier)
  console.log("\n2. Deploying WithdrawVerifier...");
  const WithdrawVerifier = await ethers.getContractFactory("WithdrawVerifier");
  const withdrawVerifier = await WithdrawVerifier.deploy();
  await withdrawVerifier.waitForDeployment();
  const withdrawVerifierAddress = await withdrawVerifier.getAddress();
  console.log("   WithdrawVerifier deployed to:", withdrawVerifierAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("Chain ID:", network.chainId.toString());
  console.log("TransferVerifier:", transferVerifierAddress);
  console.log("WithdrawVerifier:", withdrawVerifierAddress);
  console.log("\nSave these addresses for deploy-v10.ts!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
