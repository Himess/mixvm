const { ethers } = require("ethers");

// Arc Testnet
const ARC_RPC = "https://arc-testnet.drpc.org";
const ARC_CHAIN_ID = 5042002;
const ARC_CCTP_DOMAIN = 26;

// Base Sepolia  
const BASE_RPC = "https://sepolia.base.org";
const BASE_CHAIN_ID = 84532;
const BASE_CCTP_DOMAIN = 6;

// Deployer
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// Deployed contracts
const ARC_CCTP_SOURCE = "0x524212d086103566D91E37c8fF493598325E8d3F";
const BASE_CCTP_DESTINATION = "0xF7edaD804760cfDD4050ca9623BFb421Cc2Fe2cf";

// ABIs
const SOURCE_ABI = [
  "function setDestinationContract(uint32 domain, bytes32 contractAddress) external",
  "function getDestinationContract(uint32 domain) view returns (bytes32)",
];

const DESTINATION_ABI = [
  "function setAuthorizedSource(uint32 domain, bytes32 sourceContract) external",
  "function authorizedSources(uint32) view returns (bytes32)",
];

function addressToBytes32(address) {
  return "0x" + address.slice(2).padStart(64, "0");
}

async function main() {
  console.log("========================================");
  console.log("Configure Cross-Chain Authorization");
  console.log("========================================");

  // 1. Configure Arc -> Base
  console.log("\n1. Configuring Arc Testnet PrivateCCTPSource...");
  const arcProvider = new ethers.JsonRpcProvider(ARC_RPC, ARC_CHAIN_ID);
  const arcWallet = new ethers.Wallet(PRIVATE_KEY, arcProvider);
  const sourceContract = new ethers.Contract(ARC_CCTP_SOURCE, SOURCE_ABI, arcWallet);

  const destBytes32 = addressToBytes32(BASE_CCTP_DESTINATION);
  console.log("   Setting destination for domain", BASE_CCTP_DOMAIN, "to:", destBytes32);
  
  const tx1 = await sourceContract.setDestinationContract(BASE_CCTP_DOMAIN, destBytes32);
  console.log("   TX sent:", tx1.hash);
  await tx1.wait();
  console.log("   Confirmed!");

  // Verify
  const storedDest = await sourceContract.getDestinationContract(BASE_CCTP_DOMAIN);
  console.log("   Verified:", storedDest);

  // 2. Configure Base -> Arc (authorized source)
  console.log("\n2. Configuring Base Sepolia PrivateCCTPDestination...");
  const baseProvider = new ethers.JsonRpcProvider(BASE_RPC, BASE_CHAIN_ID);
  const baseWallet = new ethers.Wallet(PRIVATE_KEY, baseProvider);
  const destContract = new ethers.Contract(BASE_CCTP_DESTINATION, DESTINATION_ABI, baseWallet);

  const sourceBytes32 = addressToBytes32(ARC_CCTP_SOURCE);
  console.log("   Setting authorized source for domain", ARC_CCTP_DOMAIN, "to:", sourceBytes32);
  
  const tx2 = await destContract.setAuthorizedSource(ARC_CCTP_DOMAIN, sourceBytes32);
  console.log("   TX sent:", tx2.hash);
  await tx2.wait();
  console.log("   Confirmed!");

  // Verify
  const storedSource = await destContract.authorizedSources(ARC_CCTP_DOMAIN);
  console.log("   Verified:", storedSource);

  console.log("\n========================================");
  console.log("CROSS-CHAIN AUTHORIZATION COMPLETE");
  console.log("========================================");
  console.log("Arc -> Base Sepolia: CONFIGURED");
  console.log("Base Sepolia authorized source from Arc: CONFIGURED");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
