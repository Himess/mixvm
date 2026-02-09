import { ethers } from "hardhat";

/**
 * Test cross-chain transfer via LayerZero
 * Base Sepolia → Arbitrum Sepolia
 */

const BRIDGE_BASE = "0xC25Cd2A397aE57c7B1321592923C149763E97d75";
const DST_EID_ARB = 40231;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Test LayerZero: Base Sepolia → Arbitrum Sepolia ===");
  console.log("Account:", deployer.address);

  const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGE_BASE, deployer);

  const recipientCommitment = ethers.keccak256(ethers.toUtf8Bytes("arb-recipient-" + Date.now()));
  const amount = ethers.parseUnits("0.5", 6); // 0.5 USDC
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes("arb-nullifier-" + Date.now()));
  const newSenderCommitment = ethers.keccak256(ethers.toUtf8Bytes("arb-sender-new-" + Date.now()));

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

  // Type 3 options - 500k gas for lzReceive
  const options = '0x0003010011010000000000000000000000000007a120';

  console.log("\nParameters:");
  console.log("  Destination: Arbitrum Sepolia (EID:", DST_EID_ARB, ")");
  console.log("  Amount:", ethers.formatUnits(amount, 6), "USDC");

  // Quote fee
  console.log("\nQuoting LayerZero fee...");
  try {
    const [nativeFee, lzTokenFee] = await bridge.quote(
      DST_EID_ARB,
      recipientCommitment,
      amount,
      stealthData,
      options
    );
    console.log("Native Fee:", ethers.formatEther(nativeFee), "ETH");

    // Send transfer
    console.log("\nSending cross-chain transfer...");
    const tx = await bridge.initiateTransfer(
      DST_EID_ARB,
      recipientCommitment,
      amount,
      nullifier,
      newSenderCommitment,
      proof,
      stealthData,
      auditData,
      options,
      { value: nativeFee }
    );

    console.log("TX Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transfer initiated!");
    console.log("Block:", receipt?.blockNumber);
    console.log("Gas used:", receipt?.gasUsed.toString());

    for (const log of receipt?.logs || []) {
      try {
        const parsed = bridge.interface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "CrossChainTransferInitiated") {
          console.log("\nCrossChainTransferInitiated Event:");
          console.log("  Destination EID:", parsed.args.dstEid.toString());
          console.log("  Amount:", ethers.formatUnits(parsed.args.amount, 6), "USDC");
          console.log("  GUID:", parsed.args.guid);
        }
      } catch (e) {}
    }

    console.log("\nLayerZero Scan: https://testnet.layerzeroscan.com/tx/" + tx.hash);
    console.log("L2 -> L2 olduğu için 1-2 dk içinde Arb tarafında tamamlanmalı.");

  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.data) console.error("Error data:", error.data);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
