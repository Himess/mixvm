import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying Mock FHE infrastructure with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // 1. Deploy MockACL
  console.log("\n--- Deploying MockACL ---");
  const MockACL = await ethers.getContractFactory("MockACL");
  const mockACL = await MockACL.deploy();
  await mockACL.waitForDeployment();
  const aclAddress = await mockACL.getAddress();
  console.log("MockACL deployed to:", aclAddress);

  // 2. Deploy MockFHEVMExecutor (Coprocessor)
  console.log("\n--- Deploying MockFHEVMExecutor ---");
  const MockFHEVMExecutor = await ethers.getContractFactory("MockFHEVMExecutor");
  const mockExecutor = await MockFHEVMExecutor.deploy();
  await mockExecutor.waitForDeployment();
  const executorAddress = await mockExecutor.getAddress();
  console.log("MockFHEVMExecutor deployed to:", executorAddress);

  // 3. Deploy MockKMSVerifier
  console.log("\n--- Deploying MockKMSVerifier ---");
  const MockKMSVerifier = await ethers.getContractFactory("MockKMSVerifier");
  const mockKMS = await MockKMSVerifier.deploy();
  await mockKMS.waitForDeployment();
  const kmsAddress = await mockKMS.getAddress();
  console.log("MockKMSVerifier deployed to:", kmsAddress);

  // 4. Deploy FHEDebug
  console.log("\n--- Deploying FHEDebug ---");
  const FHEDebug = await ethers.getContractFactory("FHEDebug");
  const fheDebug = await FHEDebug.deploy();
  await fheDebug.waitForDeployment();
  const debugAddress = await fheDebug.getAddress();
  console.log("FHEDebug deployed to:", debugAddress);

  // 5. Configure FHEDebug with mock addresses
  console.log("\n--- Configuring FHEDebug with Mock Coprocessor ---");
  const configTx = await fheDebug.setArcConfig(aclAddress, executorAddress, kmsAddress);
  await configTx.wait();
  console.log("Config set!");

  const isConfigured = await fheDebug.isConfigured();
  console.log("isConfigured:", isConfigured);

  // 6. Test setEncrypted
  console.log("\n--- Testing setEncrypted ---");
  try {
    const dummyHandle = ethers.zeroPadBytes("0xABCD", 32);
    const dummyProof = "0x";

    console.log("Calling setEncrypted with handle:", dummyHandle);
    const setTx = await fheDebug.setEncrypted(dummyHandle, dummyProof, { gasLimit: 500000 });
    const setReceipt = await setTx.wait();
    console.log("setEncrypted TX:", setReceipt?.hash);
    console.log("SUCCESS: setEncrypted executed!");

    const encValue = await fheDebug.getEncryptedValue();
    console.log("encryptedValue after set:", encValue);
  } catch (error: any) {
    console.error("setEncrypted FAILED:", error.message);
  }

  // 7. Test addEncrypted (FHE.add)
  console.log("\n--- Testing addEncrypted (FHE.add) ---");
  try {
    const dummyHandle2 = ethers.zeroPadBytes("0x1234", 32);
    const dummyProof = "0x";

    console.log("Calling addEncrypted...");
    const addTx = await fheDebug.addEncrypted(dummyHandle2, dummyProof, { gasLimit: 500000 });
    const addReceipt = await addTx.wait();
    console.log("addEncrypted TX:", addReceipt?.hash);
    console.log("SUCCESS: addEncrypted (FHE.add) executed!");

    const encValue = await fheDebug.getEncryptedValue();
    console.log("encryptedValue after add:", encValue);
  } catch (error: any) {
    console.error("addEncrypted FAILED:", error.message);
  }

  // Summary
  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("MockACL:", aclAddress);
  console.log("MockFHEVMExecutor:", executorAddress);
  console.log("MockKMSVerifier:", kmsAddress);
  console.log("FHEDebug:", debugAddress);

  return {
    aclAddress,
    executorAddress,
    kmsAddress,
    debugAddress,
  };
}

main()
  .then((addresses) => {
    console.log("\n=== SUCCESS ===");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n=== FAILED ===");
    console.error(error);
    process.exit(1);
  });
