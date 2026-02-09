import { ethers } from "hardhat";

async function main() {
  console.log("=== Deploying PrivateUSDC to Arc Testnet ===\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC\n");

  // Deploy Groth16Verifier first
  console.log("Deploying Groth16Verifier...");
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Groth16Verifier deployed to:", verifierAddress);

  // Deploy PrivateUSDC
  console.log("\nDeploying PrivateUSDC...");
  const PrivateUSDC = await ethers.getContractFactory("PrivateUSDC");
  const privateUSDC = await PrivateUSDC.deploy(verifierAddress);
  await privateUSDC.waitForDeployment();
  const privateUSDCAddress = await privateUSDC.getAddress();
  console.log("PrivateUSDC deployed to:", privateUSDCAddress);

  console.log("\n=== Deployment Complete ===");
  console.log("Groth16Verifier:", verifierAddress);
  console.log("PrivateUSDC:", privateUSDCAddress);

  console.log("\n=== Contract Info ===");
  console.log("- Users can register with a zero-balance commitment");
  console.log("- Deposit USDC to get encrypted balance");
  console.log("- Transfer privately using ZK proofs");
  console.log("- Withdraw by proving balance");

  // Verify verifier is set correctly
  const storedVerifier = await privateUSDC.verifier();
  console.log("\nVerifier set correctly:", storedVerifier === verifierAddress);

  return { verifierAddress, privateUSDCAddress };
}

main()
  .then((addresses) => {
    console.log("\n✅ Deployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
