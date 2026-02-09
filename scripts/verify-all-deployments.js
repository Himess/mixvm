/**
 * Verify All Deployments
 * Checks that all contracts are properly deployed and configured
 */
const { ethers } = require("ethers");

const DEPLOYMENTS = {
  arcTestnet: {
    rpc: "https://arc-testnet.drpc.org",
    chainId: 5042002,
    contracts: {
      privateUSDC: "0x92f71638d49592AEe11691Dbf30d3fb16d7c0086",
      transferVerifier: "0xb7438C9Cf91cE85f7C261048149d5aF03b9A12CC",
      withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
      poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
      cctpSource: "0x524212d086103566D91E37c8fF493598325E8d3F",
      stealthRegistry: "0xd209CbDD434F646388775A8223c4644491c89fB1",
    },
  },
  baseSepolia: {
    rpc: "https://sepolia.base.org",
    chainId: 84532,
    contracts: {
      poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
      transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
      withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
      cctpDestination: "0xF7edaD804760cfDD4050ca9623BFb421Cc2Fe2cf",
      stealthRegistry: "0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5",
    },
  },
};

const SIMPLE_ABI = [
  "function getMerkleRoot() view returns (bytes32)",
  "function getAnnouncementCount() view returns (uint256)",
];

async function verifyContract(provider, address, name) {
  try {
    const code = await provider.getCode(address);
    if (code === "0x") {
      return { name, address, status: "NOT DEPLOYED", error: "No bytecode" };
    }
    return { name, address, status: "OK", bytecodeSize: (code.length - 2) / 2 };
  } catch (err) {
    return { name, address, status: "ERROR", error: err.message };
  }
}

async function main() {
  console.log("========================================");
  console.log("Verify All Deployments");
  console.log("========================================\n");

  for (const [networkName, network] of Object.entries(DEPLOYMENTS)) {
    console.log("---", networkName.toUpperCase(), "---");
    console.log("RPC:", network.rpc);
    console.log("Chain ID:", network.chainId);
    
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId);
    
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log("Current block:", blockNumber);
    } catch (err) {
      console.log("RPC ERROR:", err.message);
      continue;
    }

    console.log("\nContracts:");
    for (const [name, address] of Object.entries(network.contracts)) {
      const result = await verifyContract(provider, address, name);
      const statusSymbol = result.status === "OK" ? "+" : "X";
      console.log("  [" + statusSymbol + "]", name + ":", address);
      if (result.status === "OK") {
        console.log("      Bytecode size:", result.bytecodeSize, "bytes");
      } else {
        console.log("      Status:", result.status, result.error || "");
      }
    }
    console.log("");
  }

  console.log("========================================");
  console.log("VERIFICATION COMPLETE");
  console.log("========================================");
}

main().catch(console.error);
