const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration - Arc Testnet
const RPC_URL = "https://arc-testnet.drpc.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 5042002;

// Existing Arc Testnet contracts
const EXISTING = {
  transferVerifier: "0xb7438C9Cf91cE85f7C261048149d5aF03b9A12CC",
  poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
  auditor: "0xF505e2E71df58D7244189072008f25f6b6aaE5ae", // Deployer as auditor
};

// Arc Testnet CCTP addresses (from plan3.md)
const CCTP = {
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  usdc: "0x0000000000000000000000000000000000000000", // Native gas token on Arc
};

async function main() {
  console.log("========================================");
  console.log("Deploy PrivateCCTPSource - Arc Testnet");
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
    console.log("ERROR: No balance!");
    return;
  }

  // Read contract artifact
  const artifactPath = path.join(__dirname, "../artifacts/contracts/PrivateCCTPSource.sol/PrivateCCTPSource.json");
  
  if (!fs.existsSync(artifactPath)) {
    console.log("ERROR: Artifact not found. Run 'npx hardhat compile' first.");
    return;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  console.log("\nDeploying PrivateCCTPSource...");
  console.log("Constructor args:");
  console.log("  - verifier:", EXISTING.transferVerifier);
  console.log("  - poseidon:", EXISTING.poseidonHasher);
  console.log("  - tokenMessenger:", CCTP.tokenMessenger);
  console.log("  - messageTransmitter:", CCTP.messageTransmitter);
  console.log("  - usdc:", CCTP.usdc);
  console.log("  - auditor:", EXISTING.auditor);

  const Factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  const contract = await Factory.deploy(
    EXISTING.transferVerifier,
    EXISTING.poseidonHasher,
    CCTP.tokenMessenger,
    CCTP.messageTransmitter,
    CCTP.usdc,
    EXISTING.auditor
  );

  console.log("TX sent:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("PrivateCCTPSource deployed to:", address);

  // Verify deployment
  console.log("\nVerifying deployment...");
  const merkleRoot = await contract.getMerkleRoot();
  console.log("Merkle root:", merkleRoot);

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("PrivateCCTPSource:", address);
  console.log("\nNext: Deploy StealthRegistry on Arc");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
