import { ethers } from "hardhat";

/**
 * Deploy PrivateLZBridge to Arbitrum Sepolia
 *
 * LayerZero V2 Addresses:
 * - Endpoint: 0x6EDCE65403992e310A62460808c4b910D972f10f
 * - EID: 40231
 *
 * USDC: 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Arbitrum Sepolia LayerZero Bridge Deployment ===");
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Step 1: Deploy PoseidonHasher
  console.log("\n--- Step 1: Deploying PoseidonHasher ---");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidonHasher = await PoseidonHasher.deploy();
  await poseidonHasher.waitForDeployment();
  const poseidonHasherAddress = await poseidonHasher.getAddress();
  console.log("PoseidonHasher deployed to:", poseidonHasherAddress);

  // For MVP, placeholder verifiers (not checked in basic flow)
  const transferVerifier = poseidonHasherAddress; // Placeholder
  const withdrawVerifier = poseidonHasherAddress; // Placeholder

  // LayerZero V2 addresses
  const lzEndpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const localEid = 40231; // Arbitrum Sepolia EID

  // USDC (Arbitrum Sepolia)
  const usdc = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

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
  console.log("\nPrivateLZBridge deployed to:", bridgeAddress);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Contracts:");
  console.log("  PoseidonHasher:", poseidonHasherAddress);
  console.log("  PrivateLZBridge:", bridgeAddress);

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Run: npx hardhat run scripts/configure-arb-peers.ts --network arbitrumSepolia");
  console.log("2. Run: npx hardhat run scripts/configure-arb-peers.ts --network baseSepolia");
  console.log("3. Run: npx hardhat run scripts/configure-arb-peers.ts --network ethereumSepolia");
  console.log("4. Run: npx hardhat run scripts/configure-arb-dvn.ts --network arbitrumSepolia");
  console.log("5. Fund with USDC for liquidity");

  return bridgeAddress;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
