import { ethers } from "hardhat";
import * as hre from "hardhat";

/**
 * Full LayerZero Bridge Deployment
 *
 * Deploys PrivateLZBridge to both Base Sepolia and Ethereum Sepolia,
 * then configures peers for cross-chain communication.
 *
 * Run with: npx hardhat run scripts/deploy-lz-full.ts
 */

// Configuration
const CONFIG = {
  baseSepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    lzEid: 40245,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    // Existing verifiers from CCTP deployment
    transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
    withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
    poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
  },
  ethSepolia: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    lzEid: 40161,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    // Will deploy new ones
    transferVerifier: "",
    withdrawVerifier: "",
    poseidonHasher: "",
  },
};

async function deployToChain(chainConfig: any, deployerPrivateKey: string) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Deploying to ${chainConfig.name}`);
  console.log(`${"=".repeat(50)}`);

  const provider = new ethers.JsonRpcProvider(chainConfig.rpc, chainConfig.chainId);
  const deployer = new ethers.Wallet(deployerPrivateKey, provider);

  console.log("Deployer:", deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.01")) {
    throw new Error(`Insufficient balance on ${chainConfig.name}`);
  }

  let poseidonHasherAddress = chainConfig.poseidonHasher;
  let transferVerifierAddress = chainConfig.transferVerifier;
  let withdrawVerifierAddress = chainConfig.withdrawVerifier;

  // Deploy verifiers if not set
  if (!poseidonHasherAddress) {
    console.log("\nDeploying PoseidonHasher...");
    const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher", deployer);
    const poseidonHasher = await PoseidonHasher.deploy();
    await poseidonHasher.waitForDeployment();
    poseidonHasherAddress = await poseidonHasher.getAddress();
    console.log("✅ PoseidonHasher:", poseidonHasherAddress);

    // For MVP, use placeholder verifiers
    transferVerifierAddress = poseidonHasherAddress;
    withdrawVerifierAddress = poseidonHasherAddress;
  }

  // Deploy Bridge
  console.log("\nDeploying PrivateLZBridge...");
  const PrivateLZBridge = await ethers.getContractFactory("PrivateLZBridge", deployer);
  const bridge = await PrivateLZBridge.deploy(
    chainConfig.lzEndpoint,
    transferVerifierAddress,
    withdrawVerifierAddress,
    poseidonHasherAddress,
    chainConfig.usdc,
    chainConfig.lzEid,
    deployer.address
  );

  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("✅ PrivateLZBridge:", bridgeAddress);

  return {
    bridgeAddress,
    poseidonHasherAddress,
    provider,
    deployer,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("MixVM LayerZero Bridge - Full Deployment");
  console.log("=".repeat(60));

  const privateKey = process.env.PRIVATE_KEY || "";

  // Deploy to Base Sepolia
  const baseResult = await deployToChain(CONFIG.baseSepolia, privateKey);

  // Deploy to Ethereum Sepolia
  const ethResult = await deployToChain(CONFIG.ethSepolia, privateKey);

  // Configure peers
  console.log("\n" + "=".repeat(50));
  console.log("Configuring Cross-Chain Peers");
  console.log("=".repeat(50));

  // Set peer on Base Sepolia
  console.log("\nSetting peer on Base Sepolia...");
  const baseBridge = await ethers.getContractAt(
    "PrivateLZBridge",
    baseResult.bridgeAddress,
    baseResult.deployer
  );
  const ethPeerBytes32 = ethers.zeroPadValue(ethResult.bridgeAddress, 32);
  const tx1 = await baseBridge.setPeer(CONFIG.ethSepolia.lzEid, ethPeerBytes32);
  await tx1.wait();
  console.log("✅ Base Sepolia peer set to Eth Sepolia bridge");

  // Set peer on Ethereum Sepolia
  console.log("\nSetting peer on Ethereum Sepolia...");
  const ethBridge = await ethers.getContractAt(
    "PrivateLZBridge",
    ethResult.bridgeAddress,
    ethResult.deployer
  );
  const basePeerBytes32 = ethers.zeroPadValue(baseResult.bridgeAddress, 32);
  const tx2 = await ethBridge.setPeer(CONFIG.baseSepolia.lzEid, basePeerBytes32);
  await tx2.wait();
  console.log("✅ Eth Sepolia peer set to Base Sepolia bridge");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));

  console.log("\n📍 Base Sepolia:");
  console.log(`   Bridge: ${baseResult.bridgeAddress}`);
  console.log(`   LZ EID: ${CONFIG.baseSepolia.lzEid}`);
  console.log(`   USDC: ${CONFIG.baseSepolia.usdc}`);

  console.log("\n📍 Ethereum Sepolia:");
  console.log(`   Bridge: ${ethResult.bridgeAddress}`);
  console.log(`   LZ EID: ${CONFIG.ethSepolia.lzEid}`);
  console.log(`   USDC: ${CONFIG.ethSepolia.usdc}`);

  console.log("\n🔗 Cross-chain peers configured!");

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Fund both bridges with USDC for liquidity");
  console.log("2. Test deposit on Base Sepolia");
  console.log("3. Test cross-chain transfer to Ethereum Sepolia");
  console.log("4. Test withdrawal on Ethereum Sepolia");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
