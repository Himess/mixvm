import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Checking deployment status...");
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC");

  // Get nonce to see how many transactions were sent
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  console.log("Transaction count:", nonce);

  // Try to find recent contract deployments
  console.log("\nAttempting to find deployed contracts...");

  // Manually check known addresses from previous deployment
  const previousAddresses = {
    Groth16Verifier: "0xb5781d1ec6b553a0bBC3ECD59a617ac2ad9bB549",
    StealthRegistry: "0xcb5e10efbFA72309De86Fbf338D8e3a21EfC0deB",
    PrivateUSDCv2: "0x533c5e38C88e4AEb2622Cd44B21919B517C83b42",
    PrivateUSDCMerkle: "0x0eFa40b4713E4d3720Acf0871Dfea8cd47011a7d"
  };

  for (const [name, addr] of Object.entries(previousAddresses)) {
    const code = await ethers.provider.getCode(addr);
    console.log(`  ${name} (${addr}): ${code.length > 2 ? "DEPLOYED" : "NOT FOUND"}`);
  }
}

main().catch(console.error);
