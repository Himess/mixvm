const hre = require("hardhat");

// Existing contracts (keep these)
const EXISTING = {
  withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
  poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
  auditor: "0x04BCba58E63B8067901e3A1Cd8A3bA09234C6cF8",
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("========================================");
  console.log("Deploying New Verifier & Contract");
  console.log("========================================");
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "USDC");
  console.log("========================================\n");

  // 1. Deploy new PrivateTransferVerifier (Groth16Verifier)
  console.log("1. Deploying PrivateTransferVerifier...");
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("   PrivateTransferVerifier deployed to:", verifierAddress);

  // 2. Deploy new PrivateUSDCComplete
  console.log("\n2. Deploying PrivateUSDCComplete...");

  // Auditor public key (placeholder - should be real in production)
  const auditorPubKey = [BigInt(1), BigInt(2)];

  const PrivateUSDCComplete = await hre.ethers.getContractFactory("PrivateUSDCComplete");
  const privateUSDC = await PrivateUSDCComplete.deploy(
    verifierAddress,
    EXISTING.withdrawVerifier,
    EXISTING.poseidonHasher,
    deployer.address, // deployer as auditor for testing
    auditorPubKey
  );
  await privateUSDC.waitForDeployment();
  const privateUSDCAddress = await privateUSDC.getAddress();
  console.log("   PrivateUSDCComplete deployed to:", privateUSDCAddress);

  // 3. Verify deployment
  console.log("\n3. Verifying deployment...");
  const merkleRoot = await privateUSDC.getMerkleRoot();
  const leafCount = await privateUSDC.getLeafCount();
  console.log("   Initial merkle root:", merkleRoot);
  console.log("   Initial leaf count:", leafCount.toString());

  // 4. Output summary
  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("New Contracts:");
  console.log("  PrivateTransferVerifier:", verifierAddress);
  console.log("  PrivateUSDCComplete:", privateUSDCAddress);
  console.log("\nExisting Contracts (unchanged):");
  console.log("  WithdrawVerifier:", EXISTING.withdrawVerifier);
  console.log("  PoseidonHasher:", EXISTING.poseidonHasher);
  console.log("========================================");

  console.log("\n========================================");
  console.log("Next Steps:");
  console.log("========================================");
  console.log("1. Update webapp/src/lib/wagmi.ts with new addresses:");
  console.log("   privateUSDC: '" + privateUSDCAddress + "'");
  console.log("   transferVerifier: '" + verifierAddress + "'");
  console.log("\n2. Restart webapp: cd webapp && npm run dev");
  console.log("\n3. Clear old notes in Dashboard");
  console.log("\n4. Make a new deposit and test transfer");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
