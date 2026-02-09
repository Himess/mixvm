const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration - Base Sepolia
const RPC_URL = "https://sepolia.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 84532;

// Base Sepolia CCTP addresses (from plan3.md)
const CCTP = {
  messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
  tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

async function deployContract(wallet, artifactPath, constructorArgs = [], name = "") {
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Artifact not found: " + artifactPath);
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("\nDeploying", name || path.basename(artifactPath, ".json"), "...");
  if (constructorArgs.length > 0) {
    console.log("  Constructor args:", constructorArgs);
  }
  
  const contract = await Factory.deploy(...constructorArgs);
  console.log("  TX sent:", contract.deploymentTransaction().hash);
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("  Deployed to:", address);
  
  return { contract, address };
}

async function main() {
  console.log("========================================");
  console.log("Deploy All Contracts - Base Sepolia");
  console.log("========================================");

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.log("ERROR: No balance! Fund the deployer on Base Sepolia.");
    return;
  }

  const artifactsDir = path.join(__dirname, "../artifacts/contracts");
  const deployed = {};

  // 1. Deploy PoseidonHasher (includes PoseidonT3 library)
  const poseidonHasherResult = await deployContract(
    wallet,
    path.join(artifactsDir, "libraries/PoseidonHasher.sol/PoseidonHasher.json"),
    [],
    "PoseidonHasher"
  );
  deployed.poseidonHasher = poseidonHasherResult.address;

  // 2. Deploy PrivateTransferVerifier (Groth16Verifier)
  const transferVerifierResult = await deployContract(
    wallet,
    path.join(artifactsDir, "PrivateTransferVerifier.sol/Groth16Verifier.json"),
    [],
    "PrivateTransferVerifier (Groth16Verifier)"
  );
  deployed.transferVerifier = transferVerifierResult.address;

  // 3. Deploy WithdrawVerifier
  const withdrawVerifierResult = await deployContract(
    wallet,
    path.join(artifactsDir, "WithdrawVerifier.sol/WithdrawVerifier.json"),
    [],
    "WithdrawVerifier"
  );
  deployed.withdrawVerifier = withdrawVerifierResult.address;

  // 4. Deploy PrivateCCTPDestination
  // Constructor: (poseidon, messageTransmitter, admin, auditor)
  const destinationResult = await deployContract(
    wallet,
    path.join(artifactsDir, "PrivateCCTPDestination.sol/PrivateCCTPDestination.json"),
    [
      deployed.poseidonHasher,
      CCTP.messageTransmitter,
      wallet.address,  // admin
      wallet.address,  // auditor
    ],
    "PrivateCCTPDestination"
  );
  deployed.privateCCTPDestination = destinationResult.address;

  // 5. Deploy StealthRegistry
  const stealthResult = await deployContract(
    wallet,
    path.join(artifactsDir, "StealthRegistry.sol/StealthRegistry.json"),
    [],
    "StealthRegistry"
  );
  deployed.stealthRegistry = stealthResult.address;

  // Summary
  console.log("\n========================================");
  console.log("BASE SEPOLIA DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("Deployed Contracts:");
  console.log("  PoseidonHasher:", deployed.poseidonHasher);
  console.log("  TransferVerifier:", deployed.transferVerifier);
  console.log("  WithdrawVerifier:", deployed.withdrawVerifier);
  console.log("  PrivateCCTPDestination:", deployed.privateCCTPDestination);
  console.log("  StealthRegistry:", deployed.stealthRegistry);
  console.log("\nCCTP Addresses (Circle Official):");
  console.log("  MessageTransmitter:", CCTP.messageTransmitter);
  console.log("  TokenMessenger:", CCTP.tokenMessenger);
  console.log("  USDC:", CCTP.usdc);
  console.log("========================================");

  // Save to file
  const deploymentData = {
    network: "Base Sepolia",
    chainId: CHAIN_ID,
    deployedAt: new Date().toISOString(),
    contracts: deployed,
    cctp: CCTP,
  };
  
  fs.writeFileSync(
    path.join(__dirname, "../deployed_base_sepolia.json"),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log("\nDeployment info saved to deployed_base_sepolia.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
