const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration
const RPC_URL = "https://arc-testnet.drpc.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 5042002;

// Existing contracts
const EXISTING = {
  withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
  poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
};

async function main() {
  console.log("========================================");
  console.log("Simple Deploy Script");
  console.log("========================================");

  // Connect to provider
  console.log("Connecting to:", RPC_URL);
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

  // Create wallet
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  // Get balance
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC");

  if (balance === 0n) {
    console.log("ERROR: No balance! Please fund the deployer address.");
    return;
  }

  // Read contract artifacts
  const verifierArtifactPath = path.join(__dirname, "../artifacts/contracts/PrivateTransferVerifier.sol/Groth16Verifier.json");
  const privateUSDCArtifactPath = path.join(__dirname, "../artifacts/contracts/PrivateUSDCComplete.sol/PrivateUSDCComplete.json");

  if (!fs.existsSync(verifierArtifactPath)) {
    console.log("ERROR: Verifier artifact not found. Run 'npx hardhat compile' first.");
    return;
  }

  const verifierArtifact = JSON.parse(fs.readFileSync(verifierArtifactPath, "utf8"));
  const privateUSDCArtifact = JSON.parse(fs.readFileSync(privateUSDCArtifactPath, "utf8"));

  // 1. Deploy Verifier
  console.log("\n1. Deploying Groth16Verifier...");
  const VerifierFactory = new ethers.ContractFactory(
    verifierArtifact.abi,
    verifierArtifact.bytecode,
    wallet
  );

  const verifier = await VerifierFactory.deploy();
  console.log("   TX sent:", verifier.deploymentTransaction().hash);
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("   Groth16Verifier deployed to:", verifierAddress);

  // 2. Deploy PrivateUSDCComplete
  console.log("\n2. Deploying PrivateUSDCComplete...");
  const PrivateUSDCFactory = new ethers.ContractFactory(
    privateUSDCArtifact.abi,
    privateUSDCArtifact.bytecode,
    wallet
  );

  const auditorPubKey = [1n, 2n];
  const privateUSDC = await PrivateUSDCFactory.deploy(
    verifierAddress,
    EXISTING.withdrawVerifier,
    EXISTING.poseidonHasher,
    wallet.address,
    auditorPubKey
  );
  console.log("   TX sent:", privateUSDC.deploymentTransaction().hash);
  await privateUSDC.waitForDeployment();
  const privateUSDCAddress = await privateUSDC.getAddress();
  console.log("   PrivateUSDCComplete deployed to:", privateUSDCAddress);

  // 3. Verify
  console.log("\n3. Verifying deployment...");
  const merkleRoot = await privateUSDC.getMerkleRoot();
  console.log("   Merkle root:", merkleRoot);

  // 4. Summary
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("New Contracts:");
  console.log("  transferVerifier:", verifierAddress);
  console.log("  privateUSDC:", privateUSDCAddress);
  console.log("\nUpdate webapp/src/lib/wagmi.ts:");
  console.log(`  privateUSDC: '${privateUSDCAddress}',`);
  console.log(`  transferVerifier: '${verifierAddress}',`);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
