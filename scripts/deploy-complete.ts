import { ethers } from "hardhat";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       DEPLOYING COMPLETE PRIVACY SYSTEM                  ║");
  console.log("║              Arc Network Testnet                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC\n");

  if (balance === BigInt(0)) {
    console.log("WARNING: Deployer has no balance. Please fund the account first.");
    console.log("Faucet: https://faucet.testnet.arc.network");
    return;
  }

  // 1. Deploy Groth16Verifier (reuse if exists)
  console.log("1. Deploying Groth16Verifier...");
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("   Groth16Verifier deployed:", verifierAddress);

  // 2. Deploy PoseidonHasher
  console.log("\n2. Deploying PoseidonHasher...");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidonHasher = await PoseidonHasher.deploy();
  await poseidonHasher.waitForDeployment();
  const poseidonAddress = await poseidonHasher.getAddress();
  console.log("   PoseidonHasher deployed:", poseidonAddress);

  // 3. Deploy PrivateUSDCComplete
  console.log("\n3. Deploying PrivateUSDCComplete...");

  // Auditor setup (deployer is auditor for demo)
  const auditorAddress = deployer.address;
  // Placeholder auditor public key (in production, use real BabyJubJub key)
  const auditorPubKey: [bigint, bigint] = [
    BigInt("17327936376471752554121384012506005268428481030617983218958005758396641073891"),
    BigInt("13491969718443467245810427491764832696837856543456789012345678901234567890123")
  ];

  const PrivateUSDCComplete = await ethers.getContractFactory("PrivateUSDCComplete");
  const privateUSDCComplete = await PrivateUSDCComplete.deploy(
    verifierAddress,
    poseidonAddress,
    auditorAddress,
    auditorPubKey
  );
  await privateUSDCComplete.waitForDeployment();
  const privateUSDCCompleteAddress = await privateUSDCComplete.getAddress();
  console.log("   PrivateUSDCComplete deployed:", privateUSDCCompleteAddress);

  // Summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  DEPLOYMENT COMPLETE                     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  Network: Arc Testnet (Chain ID: 5042002)                ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Groth16Verifier:      ${verifierAddress}`);
  console.log(`║  PoseidonHasher:       ${poseidonAddress}`);
  console.log(`║  PrivateUSDCComplete:  ${privateUSDCCompleteAddress}`);
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  Auditor: " + auditorAddress);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Verify contracts are deployed
  console.log("Verifying deployments...");

  const verifierCode = await ethers.provider.getCode(verifierAddress);
  const poseidonCode = await ethers.provider.getCode(poseidonAddress);
  const completeCode = await ethers.provider.getCode(privateUSDCCompleteAddress);

  console.log("  Groth16Verifier has code:", verifierCode.length > 2 ? "YES" : "NO");
  console.log("  PoseidonHasher has code:", poseidonCode.length > 2 ? "YES" : "NO");
  console.log("  PrivateUSDCComplete has code:", completeCode.length > 2 ? "YES" : "NO");

  // Test basic contract functions
  console.log("\nTesting contract functions...");

  // Test Poseidon hash
  const hash = await poseidonHasher.hash2(1, 2);
  console.log("  Poseidon hash(1, 2):", hash.toString().slice(0, 30) + "...");

  // Test Merkle root
  const merkleRoot = await privateUSDCComplete.getMerkleRoot();
  console.log("  Initial Merkle root:", merkleRoot.toString().slice(0, 30) + "...");

  // Test leaf count
  const leafCount = await privateUSDCComplete.getLeafCount();
  console.log("  Initial leaf count:", leafCount.toString());

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║     COMPLETE PRIVACY SYSTEM DEPLOYED SUCCESSFULLY        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Export addresses
  const addresses = {
    network: "arc-testnet",
    chainId: 5042002,
    deployer: deployer.address,
    contracts: {
      Groth16Verifier: verifierAddress,
      PoseidonHasher: poseidonAddress,
      PrivateUSDCComplete: privateUSDCCompleteAddress
    },
    auditor: auditorAddress,
    deployedAt: new Date().toISOString()
  };

  console.log("Deployment addresses:", JSON.stringify(addresses, null, 2));

  console.log("\n=== SDK Configuration ===");
  console.log("Use the following to initialize the SDK:\n");
  console.log(`const sdk = createArcTestnetSDK(`);
  console.log(`  "YOUR_PRIVATE_KEY",`);
  console.log(`  "${privateUSDCCompleteAddress}"`);
  console.log(`);`);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
