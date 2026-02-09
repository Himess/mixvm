import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const log: string[] = [];

  const addLog = (msg: string) => {
    log.push(msg);
    console.log(msg);
    // Also write to file immediately
    fs.appendFileSync("deploy_log.txt", msg + "\n");
  };

  // Clear log file
  fs.writeFileSync("deploy_log.txt", "");

  addLog("=== DEPLOYING COMPLETE PRIVACY SYSTEM ===");

  const [deployer] = await ethers.getSigners();
  addLog("Deployer: " + deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  addLog("Balance: " + ethers.formatEther(balance) + " USDC");

  if (balance === BigInt(0)) {
    addLog("ERROR: No balance");
    return;
  }

  // 1. Deploy Groth16Verifier
  addLog("\n1. Deploying Groth16Verifier...");
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  addLog("   Groth16Verifier: " + verifierAddress);

  // 2. Deploy PoseidonHasher
  addLog("\n2. Deploying PoseidonHasher...");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidonHasher = await PoseidonHasher.deploy();
  await poseidonHasher.waitForDeployment();
  const poseidonAddress = await poseidonHasher.getAddress();
  addLog("   PoseidonHasher: " + poseidonAddress);

  // 3. Deploy PrivateUSDCComplete
  addLog("\n3. Deploying PrivateUSDCComplete...");
  const auditorAddress = deployer.address;
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
  addLog("   PrivateUSDCComplete: " + privateUSDCCompleteAddress);

  // Summary
  addLog("\n=== DEPLOYMENT COMPLETE ===");
  addLog("Network: Arc Testnet (Chain ID: 5042002)");
  addLog("Groth16Verifier: " + verifierAddress);
  addLog("PoseidonHasher: " + poseidonAddress);
  addLog("PrivateUSDCComplete: " + privateUSDCCompleteAddress);
  addLog("Auditor: " + auditorAddress);

  // Verify
  addLog("\nVerifying deployments...");
  const v1 = await ethers.provider.getCode(verifierAddress);
  const v2 = await ethers.provider.getCode(poseidonAddress);
  const v3 = await ethers.provider.getCode(privateUSDCCompleteAddress);
  addLog("  Groth16Verifier: " + (v1.length > 2 ? "OK" : "FAILED"));
  addLog("  PoseidonHasher: " + (v2.length > 2 ? "OK" : "FAILED"));
  addLog("  PrivateUSDCComplete: " + (v3.length > 2 ? "OK" : "FAILED"));

  addLog("\n=== SUCCESS ===");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  fs.appendFileSync("deploy_log.txt", "ERROR: " + error.message + "\n");
  process.exit(1);
});
