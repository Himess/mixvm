/**
 * Chain configurations for MixVM SDK
 */

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  cctpDomain: number;
  contracts: {
    privateUSDC: string;
    transferVerifier: string;
    withdrawVerifier: string;
    poseidonHasher: string;
    cctpSource?: string;
    cctpDestination?: string;
  };
  cctp: {
    tokenMessenger: string;
    messageTransmitter: string;
    usdc: string;
  };
  explorer?: string;
}

/**
 * Arc Testnet configuration
 */
export const ARC_TESTNET: ChainInfo = {
  chainId: 5042002,
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  cctpDomain: 0, // TBD - Arc specific domain
  contracts: {
    privateUSDC: "0x409bCe14ACA25c00E558CB2A95bE6ecFbFD5c710",
    transferVerifier: "0x95fe4F40000c36CBfD32619C631Fd56Fe4e1f7d2",
    withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
    poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
    cctpSource: undefined, // To be deployed
    cctpDestination: undefined,
  },
  cctp: {
    tokenMessenger: "0x0000000000000000000000000000000000000000", // TBD
    messageTransmitter: "0x0000000000000000000000000000000000000000", // TBD
    usdc: "0x0000000000000000000000000000000000000000", // Native on Arc
  },
  explorer: "https://explorer.testnet.arc.network",
};

/**
 * Base Sepolia configuration
 */
export const BASE_SEPOLIA: ChainInfo = {
  chainId: 84532,
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  cctpDomain: 6,
  contracts: {
    privateUSDC: "", // To be deployed
    transferVerifier: "", // To be deployed
    withdrawVerifier: "", // To be deployed
    poseidonHasher: "", // To be deployed
    cctpSource: undefined,
    cctpDestination: undefined, // To be deployed
  },
  cctp: {
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  explorer: "https://sepolia.basescan.org",
};

/**
 * Ethereum Sepolia configuration
 */
export const ETHEREUM_SEPOLIA: ChainInfo = {
  chainId: 11155111,
  name: "Ethereum Sepolia",
  rpcUrl: "https://rpc.sepolia.org",
  cctpDomain: 0,
  contracts: {
    privateUSDC: "", // To be deployed
    transferVerifier: "", // To be deployed
    withdrawVerifier: "", // To be deployed
    poseidonHasher: "", // To be deployed
    cctpSource: undefined,
    cctpDestination: undefined,
  },
  cctp: {
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  explorer: "https://sepolia.etherscan.io",
};

/**
 * All supported chains
 */
export const CHAINS: Record<string, ChainInfo> = {
  arcTestnet: ARC_TESTNET,
  baseSepolia: BASE_SEPOLIA,
  ethereumSepolia: ETHEREUM_SEPOLIA,
};

/**
 * CCTP domain IDs
 */
export const CCTP_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  arc: 99, // Placeholder - TBD
} as const;

/**
 * Get chain info by chain ID
 */
export function getChainById(chainId: number): ChainInfo | undefined {
  return Object.values(CHAINS).find((chain) => chain.chainId === chainId);
}

/**
 * Get chain info by CCTP domain
 */
export function getChainByDomain(domain: number): ChainInfo | undefined {
  return Object.values(CHAINS).find((chain) => chain.cctpDomain === domain);
}

/**
 * Check if a chain is supported
 */
export function isSupportedChain(chainId: number): boolean {
  return getChainById(chainId) !== undefined;
}
