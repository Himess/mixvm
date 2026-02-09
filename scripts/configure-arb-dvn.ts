import { ethers } from "hardhat";

/**
 * Configure DVN settings for Arbitrum Sepolia LayerZero routes
 *
 * Run on each network that needs Arbitrum routes configured:
 *   npx hardhat run scripts/configure-arb-dvn.ts --network arbitrumSepolia
 *   npx hardhat run scripts/configure-arb-dvn.ts --network baseSepolia
 *   npx hardhat run scripts/configure-arb-dvn.ts --network ethereumSepolia
 */

const BRIDGES = {
  baseSepolia: "0x1AB15668906f288dE4dF3064B8B50e91eFBD771D",
  ethSepolia: "0x0896746fb3ac02891201e5c1E0dd8a0AF609F186",
  arbSepolia: "0x3905554071E2F121533EbB26Fcf7947C916299C1",
};

// DVN addresses (LayerZero Labs DVN)
const DVNS = {
  baseSepolia: "0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6",
  ethSepolia: "0x8eebf8b423b73bfca51a1db4b7354aa0bfca9193",
  arbSepolia: "0x53f488E93b4f1b60E8E83aa374dBe1780A1EE8a8",
};

// Send libraries (SendUln302)
const SEND_LIBS = {
  baseSepolia: "0xC1868e054425D378095A003EcbA3823a5D0135C9",
  ethSepolia: "0xcc1ae8Cf5D3904Cef3360A9532B477529b177cCE",
  arbSepolia: "0x4f7cd4DA19ABB31b0eC98b9066B9e857B1bf9C0E",
};

// Receive libraries (ReceiveUln302)
const RECEIVE_LIBS = {
  baseSepolia: "0x12523de19dc41c91F7d2093E0CFbB76b17012C8d",
  ethSepolia: "0xdAf00F5eE2158dD58E0d3857851c432E34A3A851",
  arbSepolia: "0x75Db67CDab2824970131D5aa9CECfC9F69c69636",
};

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
  arbSepolia: 40231,
};

const CONFIG_TYPE_ULN = 2;

async function setDvnConfig(
  bridge: any,
  sendLib: string,
  receiveLib: string,
  remoteEid: number,
  localDvn: string,
  remoteName: string
) {
  // ULN config: (uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)
  const ulnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint64,uint8,uint8,uint8,address[],address[])"],
    [[
      2n, // confirmations
      1,  // requiredDVNCount
      0,  // optionalDVNCount
      0,  // optionalDVNThreshold
      [localDvn], // requiredDVNs
      []  // optionalDVNs
    ]]
  );

  // Set Send Library Config
  console.log(`\n  Setting send config -> ${remoteName} (EID: ${remoteEid})...`);
  try {
    const sendParams = [{ eid: remoteEid, configType: CONFIG_TYPE_ULN, config: ulnConfig }];
    const tx1 = await bridge.setConfig(sendLib, sendParams);
    console.log("  TX:", tx1.hash);
    await tx1.wait();
    console.log(`  Send config set for ${remoteName}`);
  } catch (e: any) {
    console.error(`  Error setting send config for ${remoteName}:`, e.message);
  }

  // Set Receive Library Config
  console.log(`  Setting receive config -> ${remoteName} (EID: ${remoteEid})...`);
  try {
    const receiveParams = [{ eid: remoteEid, configType: CONFIG_TYPE_ULN, config: ulnConfig }];
    const tx2 = await bridge.setConfig(receiveLib, receiveParams);
    console.log("  TX:", tx2.hash);
    await tx2.wait();
    console.log(`  Receive config set for ${remoteName}`);
  } catch (e: any) {
    console.error(`  Error setting receive config for ${remoteName}:`, e.message);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  console.log("=== Configure Arbitrum Sepolia DVN Settings ===");
  console.log("Account:", deployer.address);
  console.log("Chain ID:", chainId);

  if (BRIDGES.arbSepolia === "DEPLOY_AND_UPDATE_THIS") {
    console.error("ERROR: Update BRIDGES.arbSepolia with the deployed contract address first!");
    process.exit(1);
  }

  if (chainId === 421614n) {
    // Arbitrum Sepolia: configure DVN for routes to Base and Eth Sepolia
    console.log("\n[Arbitrum Sepolia] Configuring DVN for all routes...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.arbSepolia, deployer);

    await setDvnConfig(bridge, SEND_LIBS.arbSepolia, RECEIVE_LIBS.arbSepolia, EIDs.baseSepolia, DVNS.arbSepolia, "Base Sepolia");
    await setDvnConfig(bridge, SEND_LIBS.arbSepolia, RECEIVE_LIBS.arbSepolia, EIDs.ethSepolia, DVNS.arbSepolia, "Ethereum Sepolia");

  } else if (chainId === 84532n) {
    // Base Sepolia: configure DVN for route to Arbitrum Sepolia
    console.log("\n[Base Sepolia] Configuring DVN for Arbitrum route...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.baseSepolia, deployer);

    await setDvnConfig(bridge, SEND_LIBS.baseSepolia, RECEIVE_LIBS.baseSepolia, EIDs.arbSepolia, DVNS.baseSepolia, "Arbitrum Sepolia");

  } else if (chainId === 11155111n) {
    // Ethereum Sepolia: configure DVN for route to Arbitrum Sepolia
    console.log("\n[Ethereum Sepolia] Configuring DVN for Arbitrum route...");
    const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGES.ethSepolia, deployer);

    await setDvnConfig(bridge, SEND_LIBS.ethSepolia, RECEIVE_LIBS.ethSepolia, EIDs.arbSepolia, DVNS.ethSepolia, "Arbitrum Sepolia");

  } else {
    console.log("Unknown network. Run on arbitrumSepolia, baseSepolia, or ethereumSepolia.");
  }

  console.log("\n=== DVN Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
