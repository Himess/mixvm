/**
 * Phase 4 Deployment Script
 *
 * Deploys:
 * 1. PrivateTransferVerifier (new Groth16 verifier from circuit)
 * 2. PoseidonT3 library
 * 3. PoseidonHasher
 * 4. PrivateUSDCComplete (with new verifier)
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║           PHASE 4: DEPLOY NEW CONTRACTS                      ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "USDC\n");

    // 1. Deploy PrivateTransferVerifier (new circuit verifier)
    console.log("1. Deploying PrivateTransferVerifier...");
    const Verifier = await ethers.getContractFactory(
        "contracts/PrivateTransferVerifier.sol:Groth16Verifier"
    );
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("   Verifier deployed:", verifierAddress);

    // 2. Deploy PoseidonHasher (PoseidonT3 is internal library, no linking needed)
    console.log("\n2. Deploying PoseidonHasher...");
    const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
    const poseidonHasher = await PoseidonHasher.deploy();
    await poseidonHasher.waitForDeployment();
    const poseidonAddress = await poseidonHasher.getAddress();
    console.log("   PoseidonHasher deployed:", poseidonAddress);

    // 3. Deploy PrivateUSDCComplete
    console.log("\n3. Deploying PrivateUSDCComplete...");

    // Auditor setup (deployer is auditor for testing)
    const auditorAddress = deployer.address;
    const auditorPubKey: [bigint, bigint] = [BigInt(1), BigInt(2)]; // Placeholder

    // PrivateUSDCComplete doesn't need library linking - it uses PoseidonHasher via interface
    const PrivateUSDCComplete = await ethers.getContractFactory("PrivateUSDCComplete");

    const privateUSDC = await PrivateUSDCComplete.deploy(
        verifierAddress,
        poseidonAddress,
        auditorAddress,
        auditorPubKey
    );
    await privateUSDC.waitForDeployment();
    const privateUSDCAddress = await privateUSDC.getAddress();
    console.log("   PrivateUSDCComplete deployed:", privateUSDCAddress);

    // Save all addresses
    const addresses = {
        verifier: verifierAddress,
        poseidonHasher: poseidonAddress,
        privateUSDC: privateUSDCAddress,
        auditor: auditorAddress,
        deployedAt: new Date().toISOString()
    };

    // Save to privacy-poc folder as well
    const outputPath = path.join(__dirname, "../privacy-poc/deployed_addresses.json");
    fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
    console.log("\n✅ Addresses saved to:", outputPath);

    // Also save to project root
    const rootPath = path.join(__dirname, "../deployed_addresses.json");
    fs.writeFileSync(rootPath, JSON.stringify(addresses, null, 2));

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║           DEPLOYMENT COMPLETE                                ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ Verifier:        ${verifierAddress}  ║`);
    console.log(`║ PoseidonHasher:  ${poseidonAddress}  ║`);
    console.log(`║ PrivateUSDC:     ${privateUSDCAddress}  ║`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    return addresses;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });
