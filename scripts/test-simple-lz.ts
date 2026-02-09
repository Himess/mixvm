import { ethers } from "hardhat";

/**
 * Test with minimal message to isolate the issue
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
  console.log("=== Simple LayerZero Test ===");
  console.log("Account:", deployer.address);

  const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.baseSepolia, deployer);

  // Test parameters - minimal
  const dstEid = EIDs.ethSepolia;
  const recipientCommitment = ethers.keccak256(ethers.toUtf8Bytes("simple-test-" + Date.now()));
  const amount = ethers.parseUnits("0.1", 6);
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-simple-" + Date.now()));
  const newSenderCommitment = ethers.keccak256(ethers.toUtf8Bytes("sender-simple-" + Date.now()));
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

  // Use much higher gas - 1M
  const options = '0x00030100110100000000000000000000000000f42400'; // 1M gas = 0xf4240

  console.log("\nParameters:");
  console.log("  Destination:", dstEid);
  console.log("  Amount:", ethers.formatUnits(amount, 6), "USDC");
  console.log("  Gas in options: 1,000,000");

  // Quote
  console.log("\nQuoting...");
  const [nativeFee] = await bridge.quote(
    dstEid,
    recipientCommitment,
    amount,
    stealthData,
    options
  );
  console.log("Fee:", ethers.formatEther(nativeFee), "ETH");

  // Send
  console.log("\nSending...");
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
    { value: nativeFee, gasLimit: 700000 }
  );

  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Sent! Gas used:", receipt?.gasUsed.toString());

  // Parse GUID
  for (const log of receipt?.logs || []) {
    try {
      const parsed = bridge.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "CrossChainTransferInitiated") {
        console.log("\nGUID:", parsed.args.guid);
        console.log("Track: https://testnet.layerzeroscan.com/tx/" + tx.hash);
      }
    } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
