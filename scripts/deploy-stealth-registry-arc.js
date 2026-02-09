const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://arc-testnet.drpc.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CHAIN_ID = 5042002;

async function main() {
  console.log("========================================");
  console.log("Deploy StealthRegistry - Arc Testnet");
  console.log("========================================");

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC");

  const artifactPath = path.join(__dirname, "../artifacts/contracts/StealthRegistry.sol/StealthRegistry.json");
  
  if (!fs.existsSync(artifactPath)) {
    console.log("ERROR: Artifact not found. Run npx hardhat compile first.");
    return;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  console.log("\nDeploying StealthRegistry...");
  const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await Factory.deploy();

  console.log("TX sent:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("StealthRegistry deployed to:", address);

  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("StealthRegistry:", address);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  });
