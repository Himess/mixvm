const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration - Base Sepolia
const RPC_URL = "https://sepolia.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 84532;

// Correct CCTP V2 addresses
const CCTP = {
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

// Already deployed contracts (v7)
const DEPLOYED = {
  transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
  withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
  poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
  stealthRegistry: "0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5",
};

async function main() {
  console.log("========================================");
  console.log("Deploy PrivateCCTPBridge v9 - Base Sepolia");
  console.log("(Fixed depositForBurn 4-param signature)");
  console.log("========================================");

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const artifactPath = path.join(__dirname, "../artifacts/contracts/PrivateCCTPBridge.sol/PrivateCCTPBridge.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Constructor args:
  // _transferVerifier, _withdrawVerifier, _poseidon, _tokenMessenger, _messageTransmitter, 
  // _usdc, _isNativeUSDC, _localDomain, _admin
  const args = [
    DEPLOYED.transferVerifier,
    DEPLOYED.withdrawVerifier,
    DEPLOYED.poseidonHasher,
    CCTP.tokenMessenger,
    CCTP.messageTransmitter,
    CCTP.usdc,
    false, // isNativeUSDC (Base uses ERC20)
    6,     // localDomain (Base Sepolia = 6)
    wallet.address, // admin
  ];

  console.log("\nDeploying with args:");
  console.log("  TransferVerifier:", args[0]);
  console.log("  WithdrawVerifier:", args[1]);
  console.log("  Poseidon:", args[2]);
  console.log("  TokenMessenger:", args[3]);
  console.log("  MessageTransmitter:", args[4]);
  console.log("  USDC:", args[5]);
  console.log("  IsNativeUSDC:", args[6]);
  console.log("  LocalDomain:", args[7]);
  console.log("  Admin:", args[8]);

  console.log("\nDeploying PrivateCCTPBridge v9...");
  const contract = await Factory.deploy(...args);
  console.log("TX sent:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("\n✅ PrivateCCTPBridge v9 deployed to:", address);

  // Set destination for Ethereum Sepolia (domain 0)
  const ethBridge = "0x394222B73b295374b951B79d5f6796b463392f87";
  const ethBridgeBytes32 = ethers.zeroPadValue(ethBridge, 32);
  
  console.log("\nSetting destination for Ethereum Sepolia (domain 0)...");
  const tx1 = await contract.setDestinationContract(0, ethBridgeBytes32);
  await tx1.wait();
  console.log("✅ Ethereum Sepolia destination set");

  // Set destination for Arc (domain 26)  
  const arcBridge = "0x75d0eeEE3288D875Dd60A0066437ed12445b0C03";
  const arcBridgeBytes32 = ethers.zeroPadValue(arcBridge, 32);
  
  console.log("\nSetting destination for Arc (domain 26)...");
  const tx2 = await contract.setDestinationContract(26, arcBridgeBytes32);
  await tx2.wait();
  console.log("✅ Arc destination set");

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE!");
  console.log("PrivateCCTPBridge v9:", address);
  console.log("========================================");
  console.log("\nUpdate chains.ts with new address!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
