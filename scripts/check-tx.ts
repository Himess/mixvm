import { ethers } from "hardhat";

/**
 * Check transaction details
 */

const TX_HASH = "0x6d9db4d5931ffe834320af14e157c90f5be06db838ca58eff3a64320670a2080";

async function main() {
  console.log("=== Check Transaction Details ===");
  console.log("TX Hash:", TX_HASH);

  const receipt = await ethers.provider.getTransactionReceipt(TX_HASH);

  if (!receipt) {
    console.log("Transaction not found");
    return;
  }

  console.log("\nTransaction Receipt:");
  console.log("  Status:", receipt.status === 1 ? "Success" : "Failed");
  console.log("  Block:", receipt.blockNumber);
  console.log("  Gas Used:", receipt.gasUsed.toString());
  console.log("  To:", receipt.to);
  console.log("  Logs count:", receipt.logs.length);

  console.log("\nLogs:");
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`\nLog ${i}:`);
    console.log("  Address:", log.address);
    console.log("  Topics:", log.topics);
    console.log("  Data:", log.data.substring(0, 200) + (log.data.length > 200 ? "..." : ""));
  }

  // Known event signatures
  const eventSigs = {
    "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f": "PacketSent(bytes,bytes,address)",
    "0x6ba2b6af1c76c4b0a73da6e4c58c2f43b6ce68b71cb1c4a52d1e7ed1f58a2e98": "OAppPreCrimeSimulated"
  };

  // Check for PacketSent event
  const packetSentTopic = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";
  const packetSent = receipt.logs.find(l => l.topics[0] === packetSentTopic);
  if (packetSent) {
    console.log("\n✅ PacketSent event found!");
    console.log("This indicates LayerZero endpoint received the message.");
  } else {
    console.log("\n⚠️ No PacketSent event found");
    console.log("The message may not have been sent to LayerZero.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
