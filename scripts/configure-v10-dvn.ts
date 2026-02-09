import { ethers } from "hardhat";

/**
 * Configure DVN settings for all 3 chains (6 directions)
 *
 * Run on each chain:
 *   npx hardhat run scripts/configure-v10-dvn.ts --network baseSepolia
 *   npx hardhat run scripts/configure-v10-dvn.ts --network ethereumSepolia
 *   npx hardhat run scripts/configure-v10-dvn.ts --network arbitrumSepolia
 */

// ===== UPDATE THESE AFTER DEPLOYING v10 =====
const BRIDGES: Record<string, string> = {
  "84532": "0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1",   // Base Sepolia
  "11155111": "0xBe5233d68db3329c62958157854e1FE483d1b4c9", // Eth Sepolia
  "421614": "0x976f28253965A5bA21ad8ada897CC8383cdF206F",   // Arb Sepolia
};

const EIDS: Record<string, number> = {
  "84532": 40245,
  "11155111": 40161,
  "421614": 40231,
};

// DVN addresses on testnets (LayerZero Labs DVN)
const DVNS: Record<string, string> = {
  "84532": "0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6",   // Base Sepolia
  "11155111": "0x8eebf8b423b73bfca51a1db4b7354aa0bfca9193", // Eth Sepolia
  "421614": "0x53f488E93b4f1b60E8E83aa374dBe1780A1EE8a8",   // Arb Sepolia
};

// Send libraries (SendUln302)
const SEND_LIBS: Record<string, string> = {
  "84532": "0xC1868e054425D378095A003EcbA3823a5D0135C9",   // Base Sepolia
  "11155111": "0xcc1ae8Cf5D3904Cef3360A9532B477529b177cCE", // Eth Sepolia
  "421614": "0x4f7cd4DA19ABB31b0eC98b9066B9e857B1bf9C0E",   // Arb Sepolia
};

// Receive libraries (ReceiveUln302)
const RECEIVE_LIBS: Record<string, string> = {
  "84532": "0x12523de19dc41c91F7d2093E0CFbB76b17012C8d",   // Base Sepolia
  "11155111": "0xdAf00F5eE2158dD58E0d3857851c432E34A3A851", // Eth Sepolia
  "421614": "0x75Db67CDab2824970131D5aa9CECfC9F69c69636",   // Arb Sepolia
};

const CONFIG_TYPE_ULN = 2;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();

  console.log("=== Configure v10 DVN Settings ===");
  console.log("Network:", network.name, "Chain ID:", chainId);
  console.log("Account:", deployer.address);

  const localBridge = BRIDGES[chainId];
  if (!localBridge || localBridge === "0x0000000000000000000000000000000000000000") {
    console.error("Bridge address not set for chain:", chainId);
    process.exit(1);
  }

  const localDvn = DVNS[chainId];
  const localSendLib = SEND_LIBS[chainId];
  const localReceiveLib = RECEIVE_LIBS[chainId];

  console.log("Bridge:", localBridge);
  console.log("Local DVN:", localDvn);
  console.log("Send Library:", localSendLib);
  console.log("Receive Library:", localReceiveLib);

  const bridge = await ethers.getContractAt("PrivateLZBridge", localBridge, deployer);

  // Configure DVN for each remote chain
  for (const [remoteChainId] of Object.entries(EIDS)) {
    if (remoteChainId === chainId) continue;

    const remoteEid = EIDS[remoteChainId];
    console.log(`\n--- Configuring DVN for chain ${remoteChainId} (EID ${remoteEid}) ---`);

    // ULN config: use local DVN for both send and receive
    const ulnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(uint64,uint8,uint8,uint8,address[],address[])"],
      [[
        2n,           // confirmations
        1,            // requiredDVNCount
        0,            // optionalDVNCount
        0,            // optionalDVNThreshold
        [localDvn],   // requiredDVNs
        []            // optionalDVNs
      ]]
    );

    // Set Send Library Config
    console.log("  Setting send library config...");
    try {
      const sendParams = [{ eid: remoteEid, configType: CONFIG_TYPE_ULN, config: ulnConfig }];
      const tx1 = await bridge.setConfig(localSendLib, sendParams);
      console.log("  TX:", tx1.hash);
      await tx1.wait();
      console.log("  Send config set!");
    } catch (e: any) {
      console.error("  Error setting send config:", e.message?.slice(0, 200));
    }

    // Set Receive Library Config
    console.log("  Setting receive library config...");
    try {
      const receiveParams = [{ eid: remoteEid, configType: CONFIG_TYPE_ULN, config: ulnConfig }];
      const tx2 = await bridge.setConfig(localReceiveLib, receiveParams);
      console.log("  TX:", tx2.hash);
      await tx2.wait();
      console.log("  Receive config set!");
    } catch (e: any) {
      console.error("  Error setting receive config:", e.message?.slice(0, 200));
    }
  }

  console.log("\n=== DVN Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
