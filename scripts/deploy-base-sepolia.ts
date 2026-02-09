import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Base Sepolia existing contracts
  const transferVerifier = "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B";
  const withdrawVerifier = "0x4aC6108858A2ba9C715d3E1694d413b01919A043";
  const poseidonHasher = "0xF900978c52C9773C40Df173802f66922D57FDCec";
  // CCTP V2 addresses (official Circle contracts)
  const tokenMessenger = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
  const messageTransmitter = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
  const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const isNativeUSDC = false;
  const localDomain = 6; // Base Sepolia CCTP domain

  console.log("\nDeploying PrivateCCTPBridge to Base Sepolia...");
  console.log("Parameters:");
  console.log("  transferVerifier:", transferVerifier);
  console.log("  withdrawVerifier:", withdrawVerifier);
  console.log("  poseidonHasher:", poseidonHasher);
  console.log("  tokenMessenger:", tokenMessenger);
  console.log("  messageTransmitter:", messageTransmitter);
  console.log("  usdc:", usdc);
  console.log("  isNativeUSDC:", isNativeUSDC);
  console.log("  localDomain:", localDomain);
  console.log("  admin:", deployer.address);

  const PrivateCCTPBridge = await ethers.getContractFactory("PrivateCCTPBridge");
  const bridge = await PrivateCCTPBridge.deploy(
    transferVerifier,
    withdrawVerifier,
    poseidonHasher,
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

  // Set up cross-chain config for Ethereum Sepolia
  const ethSepoliaDomain = 0;
  const ethSepoliaBridge = "0x394222B73b295374b951B79d5f6796b463392f87"; // Eth Sepolia bridge (v9)
  const ethSepoliaBridgeBytes32 = ethers.zeroPadValue(ethSepoliaBridge, 32);

  console.log("\nSetting destination contract for Ethereum Sepolia (domain 0)...");
  const tx1 = await bridge.setDestinationContract(ethSepoliaDomain, ethSepoliaBridgeBytes32);
  await tx1.wait();
  console.log("✅ Destination set");

  console.log("\nSetting authorized source for Ethereum Sepolia (domain 0)...");
  const tx2 = await bridge.setAuthorizedSource(ethSepoliaDomain, ethSepoliaBridgeBytes32);
  await tx2.wait();
  console.log("✅ Authorized source set");

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("New Base Sepolia bridge:", bridgeAddress);
  console.log("\nUpdate webapp/src/lib/chains.ts with this address!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
