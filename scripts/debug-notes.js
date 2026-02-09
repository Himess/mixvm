const { ethers } = require("ethers");

const RPC = "https://arc-testnet.drpc.org";
const CONTRACT = "0x92f71638d49592AEe11691Dbf30d3fb16d7c0086";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 5042002);
  
  // Get all Deposited events
  const filter = {
    address: CONTRACT,
    topics: [ethers.id("Deposited(address,uint256,bytes32,uint256)")],
    fromBlock: 23000000,
    toBlock: "latest"
  };
  
  console.log("Fetching all Deposited events...\n");
  const logs = await provider.getLogs(filter);
  
  const iface = new ethers.Interface([
    "event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)"
  ]);
  
  console.log("Found", logs.length, "deposits:\n");
  
  for (const log of logs) {
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
    console.log("LeafIndex:", parsed.args.leafIndex.toString());
    console.log("  User:", parsed.args.user);
    console.log("  Amount:", ethers.formatEther(parsed.args.amount), "USDC");
    console.log("  Commitment:", parsed.args.commitment);
    console.log("  Block:", log.blockNumber);
    console.log("");
  }
  
  // Also get PrivateTransfer events
  const transferFilter = {
    address: CONTRACT,
    topics: [ethers.id("PrivateTransfer(bytes32,bytes32)")],
    fromBlock: 23000000,
    toBlock: "latest"
  };
  
  const transferLogs = await provider.getLogs(transferFilter);
  console.log("\nFound", transferLogs.length, "private transfers");
  
  // Check contract state
  const abi = ["function nextLeafIndex() view returns (uint256)", "function getMerkleRoot() view returns (bytes32)"];
  const contract = new ethers.Contract(CONTRACT, abi, provider);
  
  const nextLeaf = await contract.nextLeafIndex();
  const root = await contract.getMerkleRoot();
  
  console.log("\nContract state:");
  console.log("  nextLeafIndex:", nextLeaf.toString());
  console.log("  merkleRoot:", root);
}

main().catch(console.error);
