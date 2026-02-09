import { ethers } from "hardhat";

/**
 * Configure LayerZero peers for Arbitrum Sepolia
 *
 * Run on each network:
 *   npx hardhat run scripts/configure-arb-peers.ts --network arbitrumSepolia
 *   npx hardhat run scripts/configure-arb-peers.ts --network baseSepolia
 *   npx hardhat run scripts/configure-arb-peers.ts --network ethereumSepolia
 */

const BRIDGES = {
  baseSepolia: "0x1AB15668906f288dE4dF3064B8B50e91eFBD771D",
  ethSepolia: "0x0896746fb3ac02891201e5c1E0dd8a0AF609F186",
  arbSepolia: "0x3905554071E2F121533EbB26Fcf7947C916299C1",
};

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
  arbSepolia: 40231,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Configuring Arbitrum Sepolia Peers ===");
  console.log("Account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log("Chain ID:", chainId);

  if (BRIDGES.arbSepolia === "DEPLOY_AND_UPDATE_THIS") {
    console.error("ERROR: Update BRIDGES.arbSepolia with the deployed contract address first!");
    process.exit(1);
  }

  if (chainId === 421614n) {
    // Arbitrum Sepolia: set peers to Base Sepolia and Eth Sepolia
    console.log("\n[Arbitrum Sepolia] Setting peers...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.arbSepolia, deployer);

    // Peer: Base Sepolia
    console.log("\nSetting peer -> Base Sepolia");
    const basePeer = ethers.zeroPadValue(BRIDGES.baseSepolia, 32);
    const tx1 = await bridge.setPeer(EIDs.baseSepolia, basePeer);
    console.log("TX:", tx1.hash);
    await tx1.wait();
    console.log("Peer set: Base Sepolia");

    // Peer: Eth Sepolia
    console.log("\nSetting peer -> Ethereum Sepolia");
    const ethPeer = ethers.zeroPadValue(BRIDGES.ethSepolia, 32);
    const tx2 = await bridge.setPeer(EIDs.ethSepolia, ethPeer);
    console.log("TX:", tx2.hash);
    await tx2.wait();
    console.log("Peer set: Ethereum Sepolia");

  } else if (chainId === 84532n) {
    // Base Sepolia: add Arbitrum Sepolia as peer
    console.log("\n[Base Sepolia] Adding Arbitrum Sepolia peer...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.baseSepolia, deployer);

    const arbPeer = ethers.zeroPadValue(BRIDGES.arbSepolia, 32);
    const tx = await bridge.setPeer(EIDs.arbSepolia, arbPeer);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("Peer set: Arbitrum Sepolia");

  } else if (chainId === 11155111n) {
    // Ethereum Sepolia: add Arbitrum Sepolia as peer
    console.log("\n[Ethereum Sepolia] Adding Arbitrum Sepolia peer...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.ethSepolia, deployer);

    const arbPeer = ethers.zeroPadValue(BRIDGES.arbSepolia, 32);
    const tx = await bridge.setPeer(EIDs.arbSepolia, arbPeer);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("Peer set: Arbitrum Sepolia");

  } else {
    console.log("Unknown network. Run on arbitrumSepolia, baseSepolia, or ethereumSepolia.");
  }

  console.log("\n=== Peer Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
