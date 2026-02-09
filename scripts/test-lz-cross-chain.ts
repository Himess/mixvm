import { ethers } from "hardhat";

/**
 * Test cross-chain transfer via LayerZero
 * Base Sepolia → Ethereum Sepolia
 */

const BRIDGES = {
  baseSepolia: "0xC25Cd2A397aE57c7B1321592923C149763E97d75",
  ethSepolia: "0x29662e5092646C2a556AD4E49a745b2a8D7EC084",
};

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Test LayerZero Cross-Chain Transfer ===");
  console.log("Account:", deployer.address);
  console.log("Route: Base Sepolia → Ethereum Sepolia\n");

  // Get bridge contract
  const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.baseSepolia, deployer);

  // Test parameters
  const dstEid = EIDs.ethSepolia;
  const recipientCommitment = ethers.keccak256(ethers.toUtf8Bytes("recipient-commitment-" + Date.now()));
  const amount = ethers.parseUnits("0.5", 6); // 0.5 USDC
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-" + Date.now()));
  const newSenderCommitment = ethers.keccak256(ethers.toUtf8Bytes("sender-new-commitment-" + Date.now()));

  // ZK proof placeholder (not verified in MVP)
  const proof: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

  // Stealth data placeholder
  const stealthData = {
    ephemeralPubKeyX: 0n,
    ephemeralPubKeyY: 0n,
    stealthAddressX: 0n,
    stealthAddressY: 0n,
    viewTag: 0n,
  };

  // Audit data placeholder
  const auditData = {
    encryptedSender: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
    encryptedRecipient: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
    encryptedAmount: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
  };

  // LayerZero V2 Type 3 options format:
  // - 0x0003 (2 bytes) - Type 3 header
  // - 0x01 (1 byte) - WORKER_ID (Executor)
  // - 0x0011 (2 bytes) - option length (17 = 1 byte type + 16 bytes gas)
  // - 0x01 (1 byte) - OPTION_TYPE_LZRECEIVE
  // - gas (16 bytes uint128) - 500000 = 0x7a120 (increased for Poseidon hash)
  const options = '0x0003010011010000000000000000000000000007a120';

  console.log("Parameters:");
  console.log("  Destination EID:", dstEid);
  console.log("  Recipient Commitment:", recipientCommitment);
  console.log("  Amount:", ethers.formatUnits(amount, 6), "USDC");
  console.log("  Nullifier:", nullifier);
  console.log("  New Sender Commitment:", newSenderCommitment);
  console.log("  Options:", options);

  // Quote the fee
  console.log("\nQuoting LayerZero fee...");
  try {
    const [nativeFee, lzTokenFee] = await bridge.quote(
      dstEid,
      recipientCommitment,
      amount,
      stealthData,
      options
    );
    console.log("Native Fee:", ethers.formatEther(nativeFee), "ETH");
    console.log("LZ Token Fee:", lzTokenFee.toString());

    // Initiate transfer
    console.log("\nInitiating cross-chain transfer...");
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
      { value: nativeFee }
    );

    console.log("TX Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Transfer initiated!");
    console.log("Block:", receipt?.blockNumber);
    console.log("Gas used:", receipt?.gasUsed.toString());

    // Parse events
    const iface = bridge.interface;
    for (const log of receipt?.logs || []) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "CrossChainTransferInitiated") {
          console.log("\n📤 CrossChainTransferInitiated Event:");
          console.log("  Destination EID:", parsed.args.dstEid.toString());
          console.log("  Recipient Commitment:", parsed.args.recipientCommitment);
          console.log("  Amount:", ethers.formatUnits(parsed.args.amount, 6), "USDC");
          console.log("  GUID:", parsed.args.guid);
        }
      } catch (e) {
        // Not our event
      }
    }

    console.log("\n=== NEXT STEPS ===");
    console.log("1. Wait ~1-2 minutes for LayerZero to deliver the message");
    console.log("2. Check Ethereum Sepolia bridge for the new commitment");
    console.log("3. LayerZero Scan: https://testnet.layerzeroscan.com/tx/" + tx.hash);

  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
