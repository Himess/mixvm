import { ethers } from "hardhat";

/**
 * Test lzReceive directly to debug the revert
 */

const BRIDGE = "0x29662e5092646C2a556AD4E49a745b2a8D7EC084";
const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const BASE_SEPOLIA_EID = 40245;
const BASE_BRIDGE = "0xC25Cd2A397aE57c7B1321592923C149763E97d75";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Test lzReceive Debug ===");
  console.log("Account:", deployer.address);

  const bridge = await ethers.getContractAt("PrivateLZBridge", BRIDGE, deployer);

  // Check peer
  const peer = await bridge.peers(BASE_SEPOLIA_EID);
  console.log("\nPeer for Base Sepolia:", peer);
  console.log("Expected peer:", ethers.zeroPadValue(BASE_BRIDGE, 32).toLowerCase());
  console.log("Peers match:", peer.toLowerCase() === ethers.zeroPadValue(BASE_BRIDGE, 32).toLowerCase());

  // Check allowInitializePath
  const origin = {
    srcEid: BASE_SEPOLIA_EID,
    sender: ethers.zeroPadValue(BASE_BRIDGE, 32),
    nonce: 0n
  };

  try {
    const allowed = await bridge.allowInitializePath(origin);
    console.log("\nallowInitializePath:", allowed);
  } catch (e: any) {
    console.log("allowInitializePath error:", e.message);
  }

  // Try to simulate lzReceive call (won't work since we're not the endpoint, but let's see the error)
  const testCommitment = ethers.keccak256(ethers.toUtf8Bytes("test-debug-" + Date.now()));
  const amount = ethers.parseUnits("0.5", 6);
  const stealthData = {
    ephemeralPubKeyX: 0n,
    ephemeralPubKeyY: 0n,
    stealthAddressX: 0n,
    stealthAddressY: 0n,
    viewTag: 0n,
  };

  const payload = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "tuple(uint256,uint256,uint256,uint256,uint256)"],
    [testCommitment, amount, [
      stealthData.ephemeralPubKeyX,
      stealthData.ephemeralPubKeyY,
      stealthData.stealthAddressX,
      stealthData.stealthAddressY,
      stealthData.viewTag
    ]]
  );
  console.log("\nPayload length:", payload.length / 2 - 1, "bytes");

  // Check if endpoint is correct
  const lzEndpoint = await bridge.lzEndpoint();
  console.log("\nBridge's LZ Endpoint:", lzEndpoint);
  console.log("Expected Endpoint:", LZ_ENDPOINT);
  console.log("Endpoints match:", lzEndpoint.toLowerCase() === LZ_ENDPOINT.toLowerCase());

  // Try calling lzReceive (will fail but shows error)
  console.log("\n--- Simulating lzReceive call (expected to fail - we're not the endpoint) ---");
  try {
    const guid = ethers.keccak256(ethers.toUtf8Bytes("test-guid"));
    await bridge.lzReceive.staticCall(
      origin,
      guid,
      payload,
      deployer.address, // executor
      "0x" // extraData
    );
    console.log("lzReceive succeeded (unexpected!)");
  } catch (e: any) {
    console.log("lzReceive error:", e.message);
    if (e.message.includes("Not endpoint")) {
      console.log("✅ Expected error - we're not the endpoint");
    }
  }

  // Test decoding
  console.log("\n--- Testing payload decoding ---");
  try {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32", "uint256", "tuple(uint256,uint256,uint256,uint256,uint256)"],
      payload
    );
    console.log("Decoded commitment:", decoded[0]);
    console.log("Decoded amount:", decoded[1].toString());
    console.log("Decoded stealthData:", decoded[2]);
  } catch (e: any) {
    console.log("Decoding error:", e.message);
  }

  // Check poseidonHasher
  const poseidonHasherAddr = await bridge.poseidonHasher();
  console.log("\n--- Testing PoseidonHasher ---");
  console.log("PoseidonHasher address:", poseidonHasherAddr);

  const poseidonHasher = await ethers.getContractAt("PoseidonHasher", poseidonHasherAddr, deployer);
  try {
    const hash = await poseidonHasher.hash2(1n, 2n);
    console.log("hash2(1, 2) =", hash.toString());
    console.log("✅ PoseidonHasher works!");
  } catch (e: any) {
    console.log("❌ PoseidonHasher error:", e.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
