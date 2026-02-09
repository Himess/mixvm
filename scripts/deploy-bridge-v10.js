const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://base-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 84532;

const CCTP = {
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const DEPLOYED = {
  transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
  withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
  poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
};

async function main() {
  console.log("Deploy PrivateCCTPBridge v10 - Base Sepolia");
  console.log("(Clean compile with correct 7-param depositForBurn)");

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  const artifactPath = path.join(__dirname, "../artifacts/contracts/PrivateCCTPBridge.sol/PrivateCCTPBridge.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  const args = [
    DEPLOYED.transferVerifier,
    DEPLOYED.withdrawVerifier,
    DEPLOYED.poseidonHasher,
    CCTP.tokenMessenger,
    CCTP.messageTransmitter,
    CCTP.usdc,
    false,
    6,
    wallet.address,
  ];

  console.log("Deploying...");
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("v10 deployed to:", address);

  // Set destinations
  const ethBridge = "0x394222B73b295374b951B79d5f6796b463392f87";
  const tx1 = await contract.setDestinationContract(0, ethers.zeroPadValue(ethBridge, 32));
  await tx1.wait();
  console.log("Ethereum destination set");

  const arcBridge = "0x75d0eeEE3288D875Dd60A0066437ed12445b0C03";
  const tx2 = await contract.setDestinationContract(26, ethers.zeroPadValue(arcBridge, 32));
  await tx2.wait();
  console.log("Arc destination set");

  console.log("\nDONE! v10:", address);
}

main().catch(console.error);
