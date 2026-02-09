import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true,
      evmVersion: "cancun"
    }
  },
  networks: {
    // Arc Testnet (Native USDC, CCTP Domain 26)
    arc: {
      url: "https://arc-testnet.drpc.org",
      chainId: 5042002,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 60000
    },
    arcTestnet: {
      url: "https://arc-testnet.drpc.org",
      chainId: 5042002,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 60000
    },
    // Base Sepolia (ERC20 USDC, CCTP Domain 6)
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      chainId: 84532,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 60000
    },
    // Ethereum Sepolia (ERC20 USDC, CCTP Domain 0)
    ethereumSepolia: {
      url: process.env.ETH_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 60000
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto"
    },
    // Arbitrum Sepolia (ERC20 USDC, LZ EID 40231)
    arbitrumSepolia: {
      url: process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 60000
    },
    // Avalanche Fuji (ERC20 USDC, CCTP Domain 1)
    avalancheFuji: {
      url: process.env.AVAX_FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 60000
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;
