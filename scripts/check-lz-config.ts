import { ethers } from "hardhat";

/**
 * Check LayerZero endpoint configuration
 */

const BRIDGES = {
  baseSepolia: "0x6ed1171a2713d2c494c737F9c89cb93ae4423b69",
  ethSepolia: "0xb11CC9D1d5d61d09A30C2CDF3Fdb7A1d905a2c6C",
};

const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

const EIDs = {
  baseSepolia: 40245,
  ethSepolia: 40161,
};

async function main() {
  const [deployer] = await ethers.getSigners();

  const network = await ethers.provider.getNetwork();
  const isBaseSepolia = network.chainId === 84532n;
  const bridgeAddress = isBaseSepolia ? BRIDGES.baseSepolia : BRIDGES.ethSepolia;
  const remoteEid = isBaseSepolia ? EIDs.ethSepolia : EIDs.baseSepolia;

  console.log("=== Check LayerZero Configuration ===");
  console.log("Network:", isBaseSepolia ? "Base Sepolia" : "Ethereum Sepolia");
  console.log("Bridge:", bridgeAddress);

  // Endpoint interface
  const endpointABI = [
    "function delegates(address) view returns (address)",
    "function defaultSendLibrary(uint32) view returns (address)",
    "function defaultReceiveLibrary(uint32) view returns (address)",
    "function getSendLibrary(address, uint32) view returns (address)",
    "function getReceiveLibrary(address, uint32) view returns (address, bool)",
    "function isRegisteredLibrary(address) view returns (bool)",
    "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes memory)",
    "function isSupportedEid(uint32 eid) view returns (bool)"
  ];

  const endpoint = new ethers.Contract(LZ_ENDPOINT, endpointABI, deployer);

  // Check delegate
  const delegate = await endpoint.delegates(bridgeAddress);
  console.log("\nDelegate:", delegate);

  // Check if remote EID is supported
  try {
    const supported = await endpoint.isSupportedEid(remoteEid);
    console.log("Remote EID supported:", supported);
  } catch (e) {
    console.log("Remote EID check failed");
  }

  // Check default libraries
  try {
    const defaultSendLib = await endpoint.defaultSendLibrary(remoteEid);
    console.log("\nDefault Send Library for EID", remoteEid + ":", defaultSendLib);
  } catch (e: any) {
    console.log("Default send library check failed:", e.message);
  }

  try {
    const defaultReceiveLib = await endpoint.defaultReceiveLibrary(remoteEid);
    console.log("Default Receive Library for EID", remoteEid + ":", defaultReceiveLib);
  } catch (e: any) {
    console.log("Default receive library check failed:", e.message);
  }

  // Check OApp-specific libraries
  try {
    const sendLib = await endpoint.getSendLibrary(bridgeAddress, remoteEid);
    console.log("\nOApp Send Library:", sendLib);
  } catch (e: any) {
    console.log("OApp send library check failed:", e.message);
  }

  try {
    const [receiveLib, isDefault] = await endpoint.getReceiveLibrary(bridgeAddress, remoteEid);
    console.log("OApp Receive Library:", receiveLib, "(default:", isDefault + ")");
  } catch (e: any) {
    console.log("OApp receive library check failed:", e.message);
  }

  // Check our bridge peer config
  const bridge = await ethers.getContractAt("PrivateLZBridge", bridgeAddress, deployer);
  const peer = await bridge.peers(remoteEid);
  console.log("\nPeer for EID", remoteEid + ":", peer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
