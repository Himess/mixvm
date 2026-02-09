import { ethers } from "hardhat";

// Önceki deployment adresleri
const MOCK_ACL = "0x893bfC281DD9b4B355260625dAF123ef711Da919";
const MOCK_EXECUTOR = "0xd1Ab08b02730fF1F1E0247Fd6E2bAdD576BAC5a8";
const MOCK_KMS = "0x73D6050535E30afCF53690236B422b1840c5f925";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Testing FHESimple with account:", deployer.address);

  // 1. Deploy FHESimple
  console.log("\n--- Deploying FHESimple ---");
  const FHESimple = await ethers.getContractFactory("FHESimple");
  const fheSimple = await FHESimple.deploy();
  await fheSimple.waitForDeployment();
  const simpleAddress = await fheSimple.getAddress();
  console.log("FHESimple deployed to:", simpleAddress);

  // 2. Configure with mock addresses
  console.log("\n--- Configuring with mock coprocessor ---");
  const configTx = await fheSimple.configure(MOCK_ACL, MOCK_EXECUTOR, MOCK_KMS);
  await configTx.wait();
  console.log("Configured!");

  const isConfigured = await fheSimple.isConfigured();
  console.log("isConfigured:", isConfigured);

  // 3. Test: testInitialized (bu coprocessor çağırmıyor, çalışmalı)
  console.log("\n--- Test 1: testInitialized ---");
  try {
    const initialized = await fheSimple.testInitialized();
    console.log("isInitialized (should be false):", initialized);
    console.log("SUCCESS: testInitialized works!");
  } catch (error: any) {
    console.error("FAILED:", error.message);
  }

  // 4. Test: setValueTrivial (bu coprocessor.trivialEncrypt çağırıyor)
  console.log("\n--- Test 2: setValueTrivial ---");
  try {
    console.log("Calling setValueTrivial(42)...");
    const trivialTx = await fheSimple.setValueTrivial(42, { gasLimit: 500000 });
    const receipt = await trivialTx.wait();
    console.log("TX Hash:", receipt?.hash);
    console.log("Gas used:", receipt?.gasUsed.toString());

    // Event'leri kontrol et
    console.log("Events:", receipt?.logs.length);

    const storedValue = await fheSimple.getStoredValue();
    console.log("Stored value:", storedValue);
    console.log("SUCCESS: setValueTrivial works!");
  } catch (error: any) {
    console.error("FAILED:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
  }

  // 5. Test: addPlainValues (FHE.add)
  console.log("\n--- Test 3: addPlainValues (FHE.add) ---");
  try {
    console.log("Calling addPlainValues(10, 20)...");
    const addTx = await fheSimple.addPlainValues(10, 20, { gasLimit: 1000000 });
    const receipt = await addTx.wait();
    console.log("TX Hash:", receipt?.hash);
    console.log("SUCCESS: addPlainValues (FHE.add) works!");

    const result = await fheSimple.getStoredValue();
    console.log("Result (encrypted handle):", result);
  } catch (error: any) {
    console.error("FAILED:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
  }

  console.log("\n=== Test Complete ===");
  console.log("FHESimple address:", simpleAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
