import { ethers } from "hardhat";

/**
 * Deploy PrivateCCTPBridge to Avalanche Fuji Testnet
 *
 * CCTP V2 Addresses for Avalanche Fuji:
 * - TokenMessenger: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
 * - MessageTransmitter: 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275
 * - USDC: 0x5425890298aed601595a70AB815c96711a31Bc65
 * - Domain: 1
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Avalanche Fuji Deployment ===");
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX");

  // Step 1: Deploy Verifier contracts
  console.log("\n--- Step 1: Deploying Verifier Contracts ---");

  // Deploy PoseidonHasher
  console.log("\nDeploying PoseidonHasher...");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidonHasher = await PoseidonHasher.deploy();
  await poseidonHasher.waitForDeployment();
  const poseidonHasherAddress = await poseidonHasher.getAddress();
  console.log("✅ PoseidonHasher deployed to:", poseidonHasherAddress);

  // Deploy PrivateTransferVerifier
  console.log("\nDeploying PrivateTransferVerifier...");
  const TransferVerifier = await ethers.getContractFactory("PrivateTransferVerifier");
  const transferVerifier = await TransferVerifier.deploy();
  await transferVerifier.waitForDeployment();
  const transferVerifierAddress = await transferVerifier.getAddress();
  console.log("✅ PrivateTransferVerifier deployed to:", transferVerifierAddress);

  // Deploy WithdrawVerifier
  console.log("\nDeploying WithdrawVerifier...");
  const WithdrawVerifier = await ethers.getContractFactory("WithdrawVerifier");
  const withdrawVerifier = await WithdrawVerifier.deploy();
  await withdrawVerifier.waitForDeployment();
  const withdrawVerifierAddress = await withdrawVerifier.getAddress();
  console.log("✅ WithdrawVerifier deployed to:", withdrawVerifierAddress);

  // Step 2: Deploy Bridge
  console.log("\n--- Step 2: Deploying PrivateCCTPBridge ---");

  // CCTP V2 addresses for Avalanche Fuji
  const tokenMessenger = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
  const messageTransmitter = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
  const usdc = "0x5425890298aed601595a70AB815c96711a31Bc65";
  const isNativeUSDC = false;
  const localDomain = 1; // Avalanche CCTP domain

  console.log("\nParameters:");
  console.log("  transferVerifier:", transferVerifierAddress);
  console.log("  withdrawVerifier:", withdrawVerifierAddress);
  console.log("  poseidonHasher:", poseidonHasherAddress);
  console.log("  tokenMessenger:", tokenMessenger);
  console.log("  messageTransmitter:", messageTransmitter);
  console.log("  usdc:", usdc);
  console.log("  isNativeUSDC:", isNativeUSDC);
  console.log("  localDomain:", localDomain);
  console.log("  admin:", deployer.address);

  const PrivateCCTPBridge = await ethers.getContractFactory("PrivateCCTPBridge");
  const bridge = await PrivateCCTPBridge.deploy(
    transferVerifierAddress,
    withdrawVerifierAddress,
    poseidonHasherAddress,
    tokenMessenger,
    messageTransmitter,
    usdc,
    isNativeUSDC,
    localDomain,
    deployer.address
  );

  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("\n✅ PrivateCCTPBridge deployed to:", bridgeAddress);

  // Step 3: Set up cross-chain configurations
  console.log("\n--- Step 3: Setting up Cross-Chain Config ---");

  // Other chain bridges (v11)
  const chains = [
    { name: "Ethereum Sepolia", domain: 0, bridge: "0x394222B73b295374b951B79d5f6796b463392f87" },
    { name: "Base Sepolia", domain: 6, bridge: "0xDF93773761102e0cbc6b90Fa04699e7f26Ac28c9" },
    { name: "Arc Testnet", domain: 26, bridge: "0x75d0eeEE3288D875Dd60A0066437ed12445b0C03" },
  ];

  for (const chain of chains) {
    const bridgeBytes32 = ethers.zeroPadValue(chain.bridge, 32);

    console.log(`\nConfiguring ${chain.name} (domain ${chain.domain})...`);

    // Set destination contract
    const tx1 = await bridge.setDestinationContract(chain.domain, bridgeBytes32);
    await tx1.wait();
    console.log(`  ✅ Destination set`);

    // Set authorized source
    const tx2 = await bridge.setAuthorizedSource(chain.domain, bridgeBytes32);
    await tx2.wait();
    console.log(`  ✅ Authorized source set`);
  }

  // Summary
  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("\nDeployed Contracts:");
  console.log("  PoseidonHasher:", poseidonHasherAddress);
  console.log("  TransferVerifier:", transferVerifierAddress);
  console.log("  WithdrawVerifier:", withdrawVerifierAddress);
  console.log("  PrivateCCTPBridge:", bridgeAddress);

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Update relayer/.env with:");
  console.log(`   AVAX_BRIDGE_ADDRESS=${bridgeAddress}`);
  console.log("\n2. Update webapp/src/lib/chains.ts with Avalanche Fuji config");
  console.log("\n3. Cross-register this bridge on other chains:");
  console.log(`   - Run cross-register script with Fuji bridge: ${bridgeAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
