/**
 * Test Deposit on Arc Testnet
 */
const { ethers } = require("ethers");

const RPC_URL = "https://arc-testnet.drpc.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CONTRACT = "0x92f71638d49592AEe11691Dbf30d3fb16d7c0086";

const ABI = [
  "function deposit(bytes32 commitment) external payable",
  "function getMerkleRoot() view returns (bytes32)",
  "function nextLeafIndex() view returns (uint256)",
  "event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)",
];

async function main() {
  console.log("========================================");
  console.log("Test Deposit - Arc Testnet");
  console.log("========================================");

  const provider = new ethers.JsonRpcProvider(RPC_URL, 5042002);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  console.log("Wallet:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "USDC");

  // Generate test commitment
  const testCommitment = "0x" + Buffer.from(ethers.randomBytes(32)).toString("hex");
  const depositAmount = ethers.parseEther("0.001");

  console.log("\n1. Depositing", ethers.formatEther(depositAmount), "USDC...");
  console.log("   Commitment:", testCommitment);

  const tx = await contract.deposit(testCommitment, { value: depositAmount });
  console.log("   TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("   Confirmed! Block:", receipt.blockNumber);

  // Check merkle root
  const merkleRoot = await contract.getMerkleRoot();
  const leafCount = await contract.nextLeafIndex();
  console.log("\n2. Contract state:");
  console.log("   Merkle root:", merkleRoot);
  console.log("   Leaf count:", leafCount.toString());

  console.log("\n========================================");
  console.log("DEPOSIT TEST PASSED!");
  console.log("========================================");
}

main().catch(console.error);
