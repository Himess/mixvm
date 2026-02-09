import { ethers } from "hardhat";

/**
 * Test direct LayerZero message send (bypassing quote)
 */

const BRIDGES = {
  baseSepolia: "0x6ed1171a2713d2c494c737F9c89cb93ae4423b69",
  ethSepolia: "0xb11CC9D1d5d61d09A30C2CDF3Fdb7A1d905a2c6C",
};

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Test Direct LayerZero Send ===");
  console.log("Account:", deployer.address);

  // Get bridge
  const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.baseSepolia, deployer);

  // Check peer is set
  const peer = await bridge.peers(EIDs.ethSepolia);
  console.log("Peer for ETH Sepolia:", peer);

  // Parameters
  const dstEid = EIDs.ethSepolia;
  const recipientCommitment = ethers.keccak256(ethers.toUtf8Bytes("test-" + Date.now()));
  const amount = ethers.parseUnits("0.1", 6);
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-" + Date.now()));
  const newSenderCommitment = ethers.keccak256(ethers.toUtf8Bytes("sender-" + Date.now()));
  const proof: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
  const stealthData = {
    ephemeralPubKeyX: 0n,
    ephemeralPubKeyY: 0n,
    stealthAddressX: 0n,
    stealthAddressY: 0n,
    viewTag: 0n,
  };
  const auditData = {
    encryptedSender: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
    encryptedRecipient: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
    encryptedAmount: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
  };
  const options = "0x"; // Let contract use defaults

  console.log("\nParameters:");
  console.log("  Destination:", dstEid);
  console.log("  Amount:", ethers.formatUnits(amount, 6), "USDC");

  // Try with a fixed fee (0.001 ETH should be enough for testnet)
  const fee = ethers.parseEther("0.005");
  console.log("  Fee (fixed):", ethers.formatEther(fee), "ETH");

  console.log("\nInitiating transfer...");
  try {
    const tx = await bridge.initiateTransfer(
      dstEid,
      recipientCommitment,
      amount,
      nullifier,
      newSenderCommitment,
      proof,
      stealthData,
      auditData,
      options,
      { value: fee, gasLimit: 500000 }
    );

    console.log("TX:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Success!");
    console.log("Gas used:", receipt?.gasUsed.toString());

    // Check LayerZero scan
    console.log("\nTrack on LayerZero Scan:");
    console.log("https://testnet.layerzeroscan.com/tx/" + tx.hash);

  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.data) {
      console.error("Data:", error.data);
    }
    // Try to decode the error
    if (error.message.includes("0x")) {
      const selector = error.message.match(/0x[a-fA-F0-9]{8}/);
      if (selector) {
        console.error("\nError selector:", selector[0]);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
