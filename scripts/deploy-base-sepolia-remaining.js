const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://sepolia.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 84532;

// Already deployed contracts
const DEPLOYED = {
  poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
  transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
};

const CCTP = {
  messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
};

async function deployContract(wallet, artifactPath, constructorArgs = [], name = "") {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("\nDeploying", name || path.basename(artifactPath, ".json"), "...");
  
  const contract = await Factory.deploy(...constructorArgs);
  console.log("  TX sent:", contract.deploymentTransaction().hash);
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("  Deployed to:", address);
  
  // Wait a bit for nonce to update
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  return address;
}

async function main() {
  console.log("========================================");
  console.log("Deploy Remaining Contracts - Base Sepolia");
  console.log("========================================");

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");
  
  console.log("\nAlready deployed:");
  console.log("  PoseidonHasher:", DEPLOYED.poseidonHasher);
  console.log("  TransferVerifier:", DEPLOYED.transferVerifier);

  const artifactsDir = path.join(__dirname, "../artifacts/contracts");

  // 3. Deploy WithdrawVerifier
  const withdrawVerifier = await deployContract(
    wallet,
    path.join(artifactsDir, "WithdrawVerifier.sol/WithdrawVerifier.json"),
    [],
    "WithdrawVerifier"
  );

  // 4. Deploy PrivateCCTPDestination
  const destination = await deployContract(
    wallet,
    path.join(artifactsDir, "PrivateCCTPDestination.sol/PrivateCCTPDestination.json"),
    [
      DEPLOYED.poseidonHasher,
      CCTP.messageTransmitter,
      wallet.address,
      wallet.address,
    ],
    "PrivateCCTPDestination"
  );

  // 5. Deploy StealthRegistry
  const stealthRegistry = await deployContract(
    wallet,
    path.join(artifactsDir, "StealthRegistry.sol/StealthRegistry.json"),
    [],
    "StealthRegistry"
  );

  console.log("\n========================================");
  console.log("BASE SEPOLIA DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("  PoseidonHasher:", DEPLOYED.poseidonHasher);
  console.log("  TransferVerifier:", DEPLOYED.transferVerifier);
  console.log("  WithdrawVerifier:", withdrawVerifier);
  console.log("  PrivateCCTPDestination:", destination);
  console.log("  StealthRegistry:", stealthRegistry);
  console.log("========================================");

  // Save
  const data = {
    network: "Base Sepolia",
    chainId: CHAIN_ID,
    deployedAt: new Date().toISOString(),
    contracts: {
      poseidonHasher: DEPLOYED.poseidonHasher,
      transferVerifier: DEPLOYED.transferVerifier,
      withdrawVerifier,
      privateCCTPDestination: destination,
      stealthRegistry,
    },
    cctp: CCTP,
  };
  
  fs.writeFileSync(
    path.join(__dirname, "../deployed_base_sepolia.json"),
    JSON.stringify(data, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
