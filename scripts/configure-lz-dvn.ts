import { ethers } from "hardhat";

/**
 * Configure DVN settings for LayerZero OApp via bridge contract
 */

const BRIDGES = {
  baseSepolia: "0x1AB15668906f288dE4dF3064B8B50e91eFBD771D",
  ethSepolia: "0x0896746fb3ac02891201e5c1E0dd8a0AF609F186",
};

// DVN addresses on testnets (LayerZero Labs DVN)
const DVNS = {
  baseSepolia: "0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6",
  ethSepolia: "0x8eebf8b423b73bfca51a1db4b7354aa0bfca9193",
};

// Send libraries
const SEND_LIBS = {
  baseSepolia: "0xC1868e054425D378095A003EcbA3823a5D0135C9",
  ethSepolia: "0xcc1ae8Cf5D3904Cef3360A9532B477529b177cCE",
};

// Receive libraries
const RECEIVE_LIBS = {
  baseSepolia: "0x12523de19dc41c91F7d2093E0CFbB76b17012C8d",
  ethSepolia: "0xdAf00F5eE2158dD58E0d3857851c432E34A3A851",
};

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
};

// ULN config type
const CONFIG_TYPE_ULN = 2;

async function main() {
  const [deployer] = await ethers.getSigners();

  const network = await ethers.provider.getNetwork();
  const isBaseSepolia = network.chainId === 84532n;

  const localBridge = isBaseSepolia ? BRIDGES.baseSepolia : BRIDGES.ethSepolia;
  const remoteEid = isBaseSepolia ? EIDs.ethSepolia : EIDs.baseSepolia;
  const localSendLib = isBaseSepolia ? SEND_LIBS.baseSepolia : SEND_LIBS.ethSepolia;
  const localReceiveLib = isBaseSepolia ? RECEIVE_LIBS.baseSepolia : RECEIVE_LIBS.ethSepolia;
  const localDvn = isBaseSepolia ? DVNS.baseSepolia : DVNS.ethSepolia;
  const remoteDvn = isBaseSepolia ? DVNS.ethSepolia : DVNS.baseSepolia;

  console.log("=== Configure LayerZero DVN Settings ===");
  console.log("Network:", isBaseSepolia ? "Base Sepolia" : "Ethereum Sepolia");
  console.log("Bridge:", localBridge);
  console.log("Remote EID:", remoteEid);
  console.log("Local DVN:", localDvn);
  console.log("Remote DVN:", remoteDvn);
  console.log("Send Library:", localSendLib);
  console.log("Receive Library:", localReceiveLib);

  const bridge = await ethers.getContractAt("PrivateLZBridge", localBridge, deployer);

  // ULN config struct: (uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)

  // Encode ULN config for send library - use local DVN for outbound
  const sendUlnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint64,uint8,uint8,uint8,address[],address[])"],
    [[
      2n, // confirmations (number of blocks to wait)
      1,  // requiredDVNCount
      0,  // optionalDVNCount
      0,  // optionalDVNThreshold
      [localDvn], // requiredDVNs - for sending, use local chain's DVN
      []  // optionalDVNs
    ]]
  );

  // Encode ULN config for receive library - use LOCAL DVN for inbound
  // ⚠️ KRİTİK: Receive config'de ALICI chain'in DVN'i kullanılmalı!
  const receiveUlnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint64,uint8,uint8,uint8,address[],address[])"],
    [[
      2n, // confirmations
      1,  // requiredDVNCount
      0,  // optionalDVNCount
      0,  // optionalDVNThreshold
      [localDvn], // requiredDVNs - ALICI chain'in kendi DVN'i (aynı provider, farklı adres)
      []  // optionalDVNs
    ]]
  );

  console.log("\n--- Setting Send Library Config ---");
  console.log("Config Type:", CONFIG_TYPE_ULN);
  console.log("Send ULN Config:", sendUlnConfig.substring(0, 100) + "...");

  try {
    const sendParams = [{
      eid: remoteEid,
      configType: CONFIG_TYPE_ULN,
      config: sendUlnConfig
    }];
    const tx1 = await bridge.setConfig(localSendLib, sendParams);
    console.log("TX:", tx1.hash);
    await tx1.wait();
    console.log("✅ Send library ULN config set");
  } catch (e: any) {
    console.error("Error setting send config:", e.message);
    if (e.data) console.error("Error data:", e.data);
  }

  console.log("\n--- Setting Receive Library Config ---");
  console.log("Receive ULN Config:", receiveUlnConfig.substring(0, 100) + "...");

  try {
    const receiveParams = [{
      eid: remoteEid,
      configType: CONFIG_TYPE_ULN,
      config: receiveUlnConfig
    }];
    const tx2 = await bridge.setConfig(localReceiveLib, receiveParams);
    console.log("TX:", tx2.hash);
    await tx2.wait();
    console.log("✅ Receive library ULN config set");
  } catch (e: any) {
    console.error("Error setting receive config:", e.message);
    if (e.data) console.error("Error data:", e.data);
  }

  console.log("\n=== Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
