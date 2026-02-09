import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=== FULL FHE TEST ON ARC ===");
  console.log("Account:", deployer.address);
  console.log("Balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // 1. Deploy fresh mock contracts
  console.log("\n--- Step 1: Deploy Mock Infrastructure ---");

  const MockACL = await ethers.getContractFactory("MockACL");
  const mockACL = await MockACL.deploy();
  await mockACL.waitForDeployment();
  console.log("MockACL:", await mockACL.getAddress());

  const MockFHEVMExecutor = await ethers.getContractFactory("MockFHEVMExecutor");
  const mockExecutor = await MockFHEVMExecutor.deploy();
  await mockExecutor.waitForDeployment();
  console.log("MockFHEVMExecutor:", await mockExecutor.getAddress());

  const MockKMSVerifier = await ethers.getContractFactory("MockKMSVerifier");
  const mockKMS = await MockKMSVerifier.deploy();
  await mockKMS.waitForDeployment();
  console.log("MockKMSVerifier:", await mockKMS.getAddress());

  // 2. Deploy FHESimple
  console.log("\n--- Step 2: Deploy FHESimple ---");
  const FHESimple = await ethers.getContractFactory("FHESimple");
  const fheSimple = await FHESimple.deploy();
  await fheSimple.waitForDeployment();
  const simpleAddress = await fheSimple.getAddress();
  console.log("FHESimple:", simpleAddress);

  // 3. Configure
  console.log("\n--- Step 3: Configure FHESimple ---");
  const configTx = await fheSimple.configure(
    await mockACL.getAddress(),
    await mockExecutor.getAddress(),
    await mockKMS.getAddress()
  );
  await configTx.wait();
  console.log("Configured!");

  // Verify configuration
  console.log("ACL addr:", await fheSimple.aclAddr());
  console.log("Coprocessor addr:", await fheSimple.coprocessorAddr());
  console.log("KMS addr:", await fheSimple.kmsAddr());

  // 4. Run tests
  console.log("\n--- Step 4: Run Tests ---");

  // Test A: testInitialized (no coprocessor call)
  console.log("\n[Test A] testInitialized()");
  try {
    const result = await fheSimple.testInitialized();
    console.log("Result:", result);
    console.log("✓ PASS");
  } catch (e: any) {
    console.log("✗ FAIL:", e.message);
  }

  // Test B: setValueTrivial (calls trivialEncrypt)
  console.log("\n[Test B] setValueTrivial(42)");
  try {
    const tx = await fheSimple.setValueTrivial(42, { gasLimit: 500000 });
    const receipt = await tx.wait();
    console.log("TX Hash:", receipt?.hash);
    console.log("Gas Used:", receipt?.gasUsed.toString());
    console.log("Status:", receipt?.status);

    // Check for events
    if (receipt?.logs && receipt.logs.length > 0) {
      console.log("Logs count:", receipt.logs.length);
      for (let i = 0; i < receipt.logs.length; i++) {
        console.log(`Log ${i}:`, receipt.logs[i]);
      }
    }

    const stored = await fheSimple.getStoredValue();
    console.log("Stored value:", stored);
    console.log("✓ PASS");
  } catch (e: any) {
    console.log("✗ FAIL:", e.message);
    // Try to get more error info
    if (e.receipt) {
      console.log("Receipt status:", e.receipt.status);
    }
  }

  // Test C: addPlainValues (calls trivialEncrypt + fheAdd)
  console.log("\n[Test C] addPlainValues(10, 20)");
  try {
    const tx = await fheSimple.addPlainValues(10, 20, { gasLimit: 1000000 });
    const receipt = await tx.wait();
    console.log("TX Hash:", receipt?.hash);
    console.log("Gas Used:", receipt?.gasUsed.toString());
    console.log("Status:", receipt?.status);

    const stored = await fheSimple.getStoredValue();
    console.log("Stored value:", stored);
    console.log("✓ PASS");
  } catch (e: any) {
    console.log("✗ FAIL:", e.message);
  }

  console.log("\n=== TEST COMPLETE ===");
  console.log("Contract addresses for explorer:");
  console.log("- FHESimple:", simpleAddress);
  console.log("- MockACL:", await mockACL.getAddress());
  console.log("- MockFHEVMExecutor:", await mockExecutor.getAddress());
  console.log("- MockKMSVerifier:", await mockKMS.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
