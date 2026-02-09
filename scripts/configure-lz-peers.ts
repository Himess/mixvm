import { ethers } from "hardhat";

/**
 * Configure LayerZero peers between Base Sepolia and Ethereum Sepolia
 */

const BRIDGES = {
  baseSepolia: "0x1AB15668906f288dE4dF3064B8B50e91eFBD771D",
  ethSepolia: "0x0896746fb3ac02891201e5c1E0dd8a0AF609F186",
};

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Configuring LayerZero Peers ===");
  console.log("Account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId === 84532n) {
    // Base Sepolia
    console.log("\nSetting peer on Base Sepolia bridge...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.baseSepolia, deployer);

    const peerBytes32 = ethers.zeroPadValue(BRIDGES.ethSepolia, 32);
    console.log("Peer (Eth Sepolia):", BRIDGES.ethSepolia);
    console.log("Peer bytes32:", peerBytes32);

    const tx = await bridge.setPeer(EIDs.ethSepolia, peerBytes32);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("✅ Peer set!");

    // Verify
    const storedPeer = await bridge.peers(EIDs.ethSepolia);
    console.log("Stored peer:", storedPeer);
  } else if (network.chainId === 11155111n) {
    // Ethereum Sepolia
    console.log("\nSetting peer on Ethereum Sepolia bridge...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.ethSepolia, deployer);

    const peerBytes32 = ethers.zeroPadValue(BRIDGES.baseSepolia, 32);
    console.log("Peer (Base Sepolia):", BRIDGES.baseSepolia);
    console.log("Peer bytes32:", peerBytes32);

    const tx = await bridge.setPeer(EIDs.baseSepolia, peerBytes32);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("✅ Peer set!");

    // Verify
    const storedPeer = await bridge.peers(EIDs.baseSepolia);
    console.log("Stored peer:", storedPeer);
  } else {
    console.log("Unknown network. Run on baseSepolia or ethereumSepolia.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
