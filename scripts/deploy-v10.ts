import { ethers } from "hardhat";

/**
 * Deploy PrivateLZBridge v10 to the current network
 *
 * Run on each chain:
 *   npx hardhat run scripts/deploy-v10.ts --network baseSepolia
 *   npx hardhat run scripts/deploy-v10.ts --network ethereumSepolia
 *   npx hardhat run scripts/deploy-v10.ts --network arbitrumSepolia
 *
 * After deploying verifiers with deploy-verifiers.ts, update the addresses below.
 */

// ===== UPDATE THESE AFTER DEPLOYING VERIFIERS =====
const CHAIN_CONFIG: Record<string, {
  lzEndpoint: string;
  transferVerifier: string;
  withdrawVerifier: string;
  poseidonHasher: string;
  usdc: string;
  localEid: number;
  cctpMessenger: string;
}> = {
  // Base Sepolia (84532) - verifiers already deployed
  "84532": {
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
    withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
    poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    localEid: 40245,
    cctpMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  // Ethereum Sepolia (11155111)
  "11155111": {
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    transferVerifier: "0x1F17d25E82B24326D899Cc17b75F7FF3a263f56b",
    withdrawVerifier: "0x96B97C487506813689092b0DD561a2052E7b25C4",
    poseidonHasher: "0xD35f2b612F96149f9869d8Db2B0a63Bef523cb0b",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    localEid: 40161,
    cctpMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  // Arbitrum Sepolia (421614)
  "421614": {
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    transferVerifier: "0xA9FC0Ec2A133abFcf801d8ba4c4eb4fD0C0aF467",
    withdrawVerifier: "0x55B4BcCdeF026c8cbF5AB495A85aa28F235a4Fed",
    poseidonHasher: "0xB83e014c837763C4c86f21C194d7Fb613edFbE2b",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    localEid: 40231,
    cctpMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();

  console.log("=== PrivateLZBridge v10 Deployment ===");
  console.log("Network:", network.name, "Chain ID:", chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const config = CHAIN_CONFIG[chainId];
  if (!config) {
    console.error("No config for chain ID:", chainId);
    console.error("Supported chains:", Object.keys(CHAIN_CONFIG).join(", "));
    process.exit(1);
  }

  // Validate verifier addresses
  if (config.transferVerifier === "0x0000000000000000000000000000000000000000") {
    console.error("TransferVerifier address not set! Run deploy-verifiers.ts first.");
    process.exit(1);
  }
  if (config.withdrawVerifier === "0x0000000000000000000000000000000000000000") {
    console.error("WithdrawVerifier address not set! Run deploy-verifiers.ts first.");
    process.exit(1);
  }

  console.log("\nParameters:");
  console.log("  lzEndpoint:", config.lzEndpoint);
  console.log("  transferVerifier:", config.transferVerifier);
  console.log("  withdrawVerifier:", config.withdrawVerifier);
  console.log("  poseidonHasher:", config.poseidonHasher);
  console.log("  usdc:", config.usdc);
  console.log("  localEid:", config.localEid);
  console.log("  owner:", deployer.address);
  console.log("  cctpMessenger:", config.cctpMessenger);

  console.log("\nDeploying PrivateLZBridge...");
  const PrivateLZBridge = await ethers.getContractFactory("PrivateLZBridge");
  const bridge = await PrivateLZBridge.deploy(
    config.lzEndpoint,
    config.transferVerifier,
    config.withdrawVerifier,
    config.poseidonHasher,
    config.usdc,
    config.localEid,
    deployer.address,
    config.cctpMessenger
  );

  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();

  console.log("\n=== Deployment Complete ===");
  console.log("PrivateLZBridge deployed to:", bridgeAddress);
  console.log("\nNEXT STEPS:");
  console.log("1. Update deployed bridge addresses in all scripts");
  console.log("2. Run configure-v10-peers.ts on all 3 chains");
  console.log("3. Run configure-v10-dvn.ts on all 3 chains");
  console.log("4. Run configure-v10-cctp.ts on all 3 chains");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
