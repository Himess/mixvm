import { ethers } from "hardhat";

async function main() {
  console.log("Deploying StealthRegistry...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  // Deploy StealthRegistry
  const StealthRegistry = await ethers.getContractFactory("StealthRegistry");
  const registry = await StealthRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("StealthRegistry deployed to:", address);

  // Verify the contract has the announce function
  const code = await ethers.provider.getCode(address);
  const announceSelector = "2cd46d6c";
  const hasAnnounce = code.toLowerCase().includes(announceSelector);
  console.log("Contract has announce function:", hasAnnounce);

  // Test a simple call
  try {
    const count = await registry.getAnnouncementCount();
    console.log("Initial announcement count:", count.toString());
  } catch (e) {
    console.error("Failed to call getAnnouncementCount:", e);
  }

  console.log("\n=== UPDATE THIS ADDRESS IN YOUR CODE ===");
  console.log("StealthRegistry address:", address);
  console.log("=========================================\n");

  // Test announce function exists by encoding a call
  try {
    const iface = registry.interface;
    const encoded = iface.encodeFunctionData("announce", [
      1, // schemeId
      "0x0000000000000000000000000000000000000001", // stealthAddress
      "0x04" + "00".repeat(64), // ephemeralPubKey (65 bytes)
      123, // viewTag
      "0x00", // metadata
    ]);
    console.log("announce function selector:", encoded.slice(0, 10));
    console.log("Expected selector: 0x2cd46d6c");
  } catch (e) {
    console.error("Failed to encode announce:", e);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
