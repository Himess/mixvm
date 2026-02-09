import { ethers } from "hardhat";
import { buildPoseidon } from "circomlibjs";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║      POSEIDON COMPATIBILITY TEST (TS vs Solidity)        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Deploy PoseidonHasher
  console.log("1. Deploying PoseidonHasher...");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidonHasher = await PoseidonHasher.deploy();
  await poseidonHasher.waitForDeployment();
  const address = await poseidonHasher.getAddress();
  console.log("   Deployed:", address);

  // Initialize TypeScript Poseidon
  console.log("\n2. Initializing TypeScript Poseidon...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  console.log("   Ready");

  // Test cases
  const testCases: [bigint, bigint][] = [
    [BigInt(0), BigInt(0)],
    [BigInt(1), BigInt(2)],
    [BigInt(123), BigInt(456)],
    [BigInt(100), BigInt(200)],
    [BigInt("12345678901234567890"), BigInt("98765432109876543210")],
  ];

  console.log("\n3. Comparing hashes:\n");
  let allMatch = true;

  for (const [a, b] of testCases) {
    // TypeScript hash
    const tsHash = F.toObject(poseidon([a, b]));

    // Solidity hash
    const solHash = await poseidonHasher.hash2(a, b);

    const match = tsHash.toString() === solHash.toString();
    allMatch = allMatch && match;

    console.log(`   Input: [${a}, ${b}]`);
    console.log(`   TypeScript: ${tsHash.toString().slice(0, 40)}...`);
    console.log(`   Solidity:   ${solHash.toString().slice(0, 40)}...`);
    console.log(`   Match: ${match ? "✓ YES" : "✗ NO"}`);
    console.log();
  }

  // Summary
  console.log("╔══════════════════════════════════════════════════════════╗");
  if (allMatch) {
    console.log("║           ALL TESTS PASSED - HASHES MATCH!              ║");
  } else {
    console.log("║           TESTS FAILED - HASHES DO NOT MATCH            ║");
  }
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  return allMatch;
}

main()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
