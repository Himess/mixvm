import { ethers } from "hardhat";

/**
 * Deploy PrivateLZBridge to Base Sepolia
 *
 * LayerZero V2 Addresses:
 * - Endpoint: 0x6EDCE65403992e310A62460808c4b910D972f10f
 * - EID: 40245
 *
 * USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Base Sepolia LayerZero Bridge Deployment ===");
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Existing verifier contracts on Base Sepolia (from CCTP deployment)
  const transferVerifier = "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B";
  const withdrawVerifier = "0x4aC6108858A2ba9C715d3E1694d413b01919A043";
  const poseidonHasher = "0xF900978c52C9773C40Df173802f66922D57FDCec";

  // LayerZero V2 addresses
  const lzEndpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const localEid = 40245; // Base Sepolia EID

  // USDC
  const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  console.log("\nDeploying PrivateLZBridge...");
  console.log("Parameters:");
  console.log("  lzEndpoint:", lzEndpoint);
  console.log("  transferVerifier:", transferVerifier);
  console.log("  withdrawVerifier:", withdrawVerifier);
  console.log("  poseidonHasher:", poseidonHasher);
  console.log("  usdc:", usdc);
  console.log("  localEid:", localEid);
  console.log("  owner:", deployer.address);

  const PrivateLZBridge = await ethers.getContractFactory("PrivateLZBridge");
  const bridge = await PrivateLZBridge.deploy(
    lzEndpoint,
    transferVerifier,
    withdrawVerifier,
    poseidonHasher,
    usdc,
    localEid,
    deployer.address
  );

  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("\n✅ PrivateLZBridge deployed to:", bridgeAddress);

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Deploy to Ethereum Sepolia");
  console.log("2. Set peer on this contract:");
  console.log(`   await bridge.setPeer(40161, ethers.zeroPadValue(ETH_BRIDGE_ADDRESS, 32))`);
  console.log("3. Set peer on Ethereum Sepolia contract:");
  console.log(`   await bridge.setPeer(40245, ethers.zeroPadValue("${bridgeAddress}", 32))`);
  console.log("4. Fund both bridges with USDC for liquidity");

  return bridgeAddress;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
