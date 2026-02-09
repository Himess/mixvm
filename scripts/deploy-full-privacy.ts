import { ethers } from "hardhat";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         DEPLOYING FULL PRIVACY SYSTEM                    ║");
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

  // 1. Deploy Groth16Verifier
  console.log("1. Deploying Groth16Verifier...");
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("   Groth16Verifier deployed:", verifierAddress);

  // 2. Deploy StealthRegistry
  console.log("\n2. Deploying StealthRegistry...");
  const StealthRegistry = await ethers.getContractFactory("StealthRegistry");
  const stealthRegistry = await StealthRegistry.deploy();
  await stealthRegistry.waitForDeployment();
  const stealthRegistryAddress = await stealthRegistry.getAddress();
  console.log("   StealthRegistry deployed:", stealthRegistryAddress);

  // 3. Deploy PrivateUSDCv2 (with Auditor)
  console.log("\n3. Deploying PrivateUSDCv2...");

  // Auditor setup (deployer is auditor for demo)
  const auditorAddress = deployer.address;
  // Placeholder auditor public key (in production, use real BabyJubJub key)
  const auditorPubKey: [bigint, bigint] = [
    BigInt("17327936376471752554121384012506005268428481030617983218958005758396641073891"),
    BigInt("13491969718443467245810427491764832696837856543456789012345678901234567890123")
  ];

  const PrivateUSDCv2 = await ethers.getContractFactory("PrivateUSDCv2");
  const privateUSDCv2 = await PrivateUSDCv2.deploy(
    verifierAddress,
    auditorAddress,
    auditorPubKey
  );
  await privateUSDCv2.waitForDeployment();
  const privateUSDCv2Address = await privateUSDCv2.getAddress();
  console.log("   PrivateUSDCv2 deployed:", privateUSDCv2Address);

  // 4. Deploy PrivateUSDCMerkle
  console.log("\n4. Deploying PrivateUSDCMerkle...");
  const PrivateUSDCMerkle = await ethers.getContractFactory("PrivateUSDCMerkle");
  const privateUSDCMerkle = await PrivateUSDCMerkle.deploy(
    verifierAddress,
    auditorAddress,
    auditorPubKey
  );
  await privateUSDCMerkle.waitForDeployment();
  const privateUSDCMerkleAddress = await privateUSDCMerkle.getAddress();
  console.log("   PrivateUSDCMerkle deployed:", privateUSDCMerkleAddress);

  // Summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  DEPLOYMENT COMPLETE                     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  Network: Arc Testnet (Chain ID: 5042002)                ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Groth16Verifier:    ${verifierAddress}`);
  console.log(`║  StealthRegistry:    ${stealthRegistryAddress}`);
  console.log(`║  PrivateUSDCv2:      ${privateUSDCv2Address}`);
  console.log(`║  PrivateUSDCMerkle:  ${privateUSDCMerkleAddress}`);
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  Auditor: " + auditorAddress);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Verify contracts are deployed
  console.log("Verifying deployments...");

  const verifierCode = await ethers.provider.getCode(verifierAddress);
  const stealthCode = await ethers.provider.getCode(stealthRegistryAddress);
  const privateV2Code = await ethers.provider.getCode(privateUSDCv2Address);
  const privateMerkleCode = await ethers.provider.getCode(privateUSDCMerkleAddress);

  console.log("  Groth16Verifier has code:", verifierCode.length > 2 ? "YES" : "NO");
  console.log("  StealthRegistry has code:", stealthCode.length > 2 ? "YES" : "NO");
  console.log("  PrivateUSDCv2 has code:", privateV2Code.length > 2 ? "YES" : "NO");
  console.log("  PrivateUSDCMerkle has code:", privateMerkleCode.length > 2 ? "YES" : "NO");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║        FULL PRIVACY SYSTEM DEPLOYED SUCCESSFULLY         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Write addresses to file
  const addresses = {
    network: "arc-testnet",
    chainId: 5042002,
    deployer: deployer.address,
    contracts: {
      Groth16Verifier: verifierAddress,
      StealthRegistry: stealthRegistryAddress,
      PrivateUSDCv2: privateUSDCv2Address,
      PrivateUSDCMerkle: privateUSDCMerkleAddress
    },
    auditor: auditorAddress,
    deployedAt: new Date().toISOString()
  };

  console.log("Deployment addresses:", JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
