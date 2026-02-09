import { ethers } from "hardhat";

/**
 * Check destination bridge for incoming cross-chain events
 */

const BRIDGES = {
  baseSepolia: "0x6ed1171a2713d2c494c737F9c89cb93ae4423b69",
  ethSepolia: "0xb11CC9D1d5d61d09A30C2CDF3Fdb7A1d905a2c6C",
};

async function main() {
  const [deployer] = await ethers.getSigners();

  const network = await ethers.provider.getNetwork();
  const isBaseSepolia = network.chainId === 84532n;
  const bridgeAddress = isBaseSepolia ? BRIDGES.baseSepolia : BRIDGES.ethSepolia;

  console.log("=== Check Bridge Events ===");
  console.log("Network:", isBaseSepolia ? "Base Sepolia" : "Ethereum Sepolia");
  console.log("Bridge:", bridgeAddress);

  const bridge = await ethers.getContractAt("PrivateLZBridge", bridgeAddress, deployer);

  // Get current block
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);

  // Check for CrossChainTransferReceived events (last 10000 blocks)
  const fromBlock = Math.max(0, currentBlock - 10000);
  console.log("\nSearching for CrossChainTransferReceived events from block", fromBlock);

  const filter = bridge.filters.CrossChainTransferReceived();
  const events = await bridge.queryFilter(filter, fromBlock);

  console.log("Events found:", events.length);

  for (const event of events) {
    const parsed = bridge.interface.parseLog({
      topics: event.topics as string[],
      data: event.data
    });
    if (parsed) {
      console.log("\n📥 CrossChainTransferReceived:");
      console.log("  Block:", event.blockNumber);
      console.log("  TX:", event.transactionHash);
      console.log("  srcEid:", parsed.args.srcEid.toString());
      console.log("  commitment:", parsed.args.commitment);
      console.log("  amount:", parsed.args.amount.toString());
      console.log("  leafIndex:", parsed.args.leafIndex.toString());
    }
  }

  // Also check for Deposited events
  const depositFilter = bridge.filters.Deposited();
  const depositEvents = await bridge.queryFilter(depositFilter, fromBlock);
  console.log("\nDeposited events found:", depositEvents.length);

  // Check for any PeerSet events
  const peerFilter = bridge.filters.PeerSet();
  const peerEvents = await bridge.queryFilter(peerFilter, fromBlock);
  console.log("PeerSet events found:", peerEvents.length);
  for (const event of peerEvents) {
    const parsed = bridge.interface.parseLog({
      topics: event.topics as string[],
      data: event.data
    });
    if (parsed) {
      console.log("  PeerSet - EID:", parsed.args.eid.toString(), "Peer:", parsed.args.peer);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
