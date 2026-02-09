import { ethers } from "hardhat";

/**
 * Deploy PrivateCCTPDestination contract to Base Sepolia or other destination chain
 *
 * Usage:
 *   npx hardhat run scripts/deploy-cctp-destination.ts --network baseSepolia
 */

// Base Sepolia CCTP addresses
const BASE_SEPOLIA_CCTP = {
  messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
  tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

// Ethereum Sepolia CCTP addresses
const ETHEREUM_SEPOLIA_CCTP = {
  messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
  tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

// CCTP Domain IDs
const CCTP_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("Deploying PrivateCCTPDestination...");
  console.log("Network:", network.name, "Chain ID:", chainId);
  console.log("Deployer:", deployer.address);

  // Select CCTP addresses based on network
  let cctpConfig;
  if (chainId === 84532) {
    // Base Sepolia
    cctpConfig = BASE_SEPOLIA_CCTP;
    console.log("Using Base Sepolia CCTP config");
  } else if (chainId === 11155111) {
    // Ethereum Sepolia
    cctpConfig = ETHEREUM_SEPOLIA_CCTP;
    console.log("Using Ethereum Sepolia CCTP config");
  } else {
    console.error("Unsupported network for CCTP destination");
    process.exit(1);
  }

  // 1. Deploy PoseidonHasher (if not already deployed)
  console.log("\n1. Deploying PoseidonHasher...");
  const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
  const poseidon = await PoseidonHasher.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddress = await poseidon.getAddress();
  console.log("   PoseidonHasher deployed to:", poseidonAddress);

  // 2. Deploy PrivateCCTPDestination
  console.log("\n2. Deploying PrivateCCTPDestination...");
  const PrivateCCTPDestination = await ethers.getContractFactory("PrivateCCTPDestination");
  const destination = await PrivateCCTPDestination.deploy(
    poseidonAddress,
    cctpConfig.messageTransmitter,
    deployer.address, // admin
    deployer.address  // auditor
  );
  await destination.waitForDeployment();
  const destinationAddress = await destination.getAddress();
  console.log("   PrivateCCTPDestination deployed to:", destinationAddress);

  // 3. Verify deployment
  console.log("\n3. Verifying deployment...");
  const merkleRoot = await destination.getMerkleRoot();
  const depositCount = await destination.getDepositCount();
  console.log("   Initial merkle root:", merkleRoot);
  console.log("   Initial deposit count:", depositCount.toString());

  // 4. Summary
  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("Chain ID:", chainId);
  console.log("PoseidonHasher:", poseidonAddress);
  console.log("PrivateCCTPDestination:", destinationAddress);
  console.log("MessageTransmitter:", cctpConfig.messageTransmitter);
  console.log("USDC:", cctpConfig.usdc);
  console.log("========================================");

  // 5. Output for deployed_addresses.json
  const deployment = {
    network: network.name,
    chainId,
    poseidon: poseidonAddress,
    cctpDestination: destinationAddress,
    cctpConfig: {
      messageTransmitter: cctpConfig.messageTransmitter,
      tokenMessenger: cctpConfig.tokenMessenger,
      usdc: cctpConfig.usdc,
    },
    deployedAt: new Date().toISOString(),
  };

  console.log("\nDeployment JSON:");
  console.log(JSON.stringify(deployment, null, 2));

  console.log("\n========================================");
  console.log("Next Steps:");
  console.log("========================================");
  console.log("1. Set authorized source contract from Arc Testnet:");
  console.log(`   await destination.setAuthorizedSource(0, "<ARC_SOURCE_ADDRESS_AS_BYTES32>")`);
  console.log("\n2. On Arc Testnet, set destination contract:");
  console.log(`   await source.setDestinationContract(6, "${destinationAddress.padEnd(66, '0')}")`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
