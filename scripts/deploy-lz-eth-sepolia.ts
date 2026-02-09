import { ethers } from "hardhat";

/**
 * Deploy PrivateLZBridge to Ethereum Sepolia
 *
 * LayerZero V2 Addresses:
 * - Endpoint: 0x6EDCE65403992e310A62460808c4b910D972f10f
 * - EID: 40161
 *
 * USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Ethereum Sepolia LayerZero Bridge Deployment ===");
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // First deploy verifier contracts if they don't exist
  console.log("\n--- Step 1: Deploying Verifier Contracts ---");

  // Deploy PoseidonHasher
  console.log("\nDeploying PoseidonHasher...");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidonHasher = await PoseidonHasher.deploy();
  await poseidonHasher.waitForDeployment();
  const poseidonHasherAddress = await poseidonHasher.getAddress();
  console.log("✅ PoseidonHasher deployed to:", poseidonHasherAddress);

  // For MVP, we'll use placeholder verifiers (not needed for basic flow)
  // In production, deploy actual Groth16 verifiers
  console.log("\nDeploying placeholder verifiers...");

  // Use a mock address for verifiers (they're not checked in MVP)
  const transferVerifier = poseidonHasherAddress; // Placeholder
  const withdrawVerifier = poseidonHasherAddress; // Placeholder

  // LayerZero V2 addresses
  const lzEndpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const localEid = 40161; // Ethereum Sepolia EID

  // USDC (Ethereum Sepolia)
  const usdc = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

  console.log("\n--- Step 2: Deploying PrivateLZBridge ---");
  console.log("Parameters:");
  console.log("  lzEndpoint:", lzEndpoint);
  console.log("  transferVerifier:", transferVerifier);
  console.log("  withdrawVerifier:", withdrawVerifier);
  console.log("  poseidonHasher:", poseidonHasherAddress);
  console.log("  usdc:", usdc);
  console.log("  localEid:", localEid);
  console.log("  owner:", deployer.address);

  const PrivateLZBridge = await ethers.getContractFactory("PrivateLZBridge");
  const bridge = await PrivateLZBridge.deploy(
    lzEndpoint,
    transferVerifier,
    withdrawVerifier,
    poseidonHasherAddress,
    usdc,
    localEid,
    deployer.address
  );

  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("\n✅ PrivateLZBridge deployed to:", bridgeAddress);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Contracts:");
  console.log("  PoseidonHasher:", poseidonHasherAddress);
  console.log("  PrivateLZBridge:", bridgeAddress);

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Set peer to Base Sepolia bridge:");
  console.log(`   await bridge.setPeer(40245, ethers.zeroPadValue(BASE_BRIDGE_ADDRESS, 32))`);
  console.log("2. On Base Sepolia, set peer to this contract:");
  console.log(`   await bridge.setPeer(40161, ethers.zeroPadValue("${bridgeAddress}", 32))`);
  console.log("3. Fund with USDC for liquidity");

  return bridgeAddress;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
