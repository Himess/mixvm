import { ethers } from "hardhat";

const CONTRACT_ADDRESS = "0x5bE5c76911854109Acd94a17D66BfF1021623136";

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("Testing FHE operations with account:", signer.address);

  const FHETest = await ethers.getContractFactory("FHETest");
  const fheTest = FHETest.attach(CONTRACT_ADDRESS);

  // Test 1: getEncryptedValue (okuma - çalışmalı)
  console.log("\n--- Test 1: getEncryptedValue ---");
  try {
    const encValue = await fheTest.getEncryptedValue();
    console.log("encryptedValue (raw bytes32):", encValue);
    console.log("SUCCESS: Read encrypted value");
  } catch (error: any) {
    console.error("FAILED:", error.message);
  }

  // Test 2: setEncrypted with dummy data
  // Bu muhtemelen başarısız olacak çünkü coprocessor yok
  console.log("\n--- Test 2: setEncrypted (dummy input) ---");
  try {
    // Dummy encrypted handle ve proof
    const dummyHandle = ethers.zeroPadBytes("0x1234", 32);
    const dummyProof = "0x";

    console.log("Calling setEncrypted with:");
    console.log("  handle:", dummyHandle);
    console.log("  proof:", dummyProof);

    const tx = await fheTest.setEncrypted(dummyHandle, dummyProof, {
      gasLimit: 500000,
    });
    const receipt = await tx.wait();
    console.log("TX Hash:", receipt?.hash);
    console.log("SUCCESS: setEncrypted executed");

    // Şimdi değeri oku
    const newValue = await fheTest.getEncryptedValue();
    console.log("New encryptedValue:", newValue);
  } catch (error: any) {
    console.error("FAILED:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    // Revert reason'ı bulmaya çalış
    if (error.reason) {
      console.error("Revert reason:", error.reason);
    }
  }

  // Test 3: addEncrypted (FHE.add)
  console.log("\n--- Test 3: addEncrypted (FHE.add) ---");
  try {
    const dummyHandle = ethers.zeroPadBytes("0x5678", 32);
    const dummyProof = "0x";

    console.log("Calling addEncrypted...");

    const tx = await fheTest.addEncrypted(dummyHandle, dummyProof, {
      gasLimit: 500000,
    });
    const receipt = await tx.wait();
    console.log("TX Hash:", receipt?.hash);
    console.log("SUCCESS: addEncrypted executed");
  } catch (error: any) {
    console.error("FAILED:", error.message);
    if (error.reason) {
      console.error("Revert reason:", error.reason);
    }
  }

  console.log("\n=== Test Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
