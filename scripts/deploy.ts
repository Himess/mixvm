import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // FHETest kontratını deploy et
  console.log("\n--- FHETest Deploy ---");
  const FHETest = await ethers.getContractFactory("FHETest");

  try {
    const fheTest = await FHETest.deploy();
    await fheTest.waitForDeployment();
    const address = await fheTest.getAddress();
    console.log("FHETest deployed to:", address);

    // Basit test: plainValue'yu ayarla
    console.log("\n--- Plain Value Test ---");
    const tx = await fheTest.setPlain(42);
    await tx.wait();
    const plainValue = await fheTest.plainValue();
    console.log("plainValue set to:", plainValue.toString());

    return address;
  } catch (error: any) {
    console.error("Deploy failed:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    throw error;
  }
}

main()
  .then((address) => {
    console.log("\n=== SUCCESS ===");
    console.log("Contract address:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n=== FAILED ===");
    console.error(error);
    process.exit(1);
  });
