/**
 * Multi-chain configuration for the MixVM privacy bridge (LayerZero Version)
 *
 * Supported chains:
 * - Base Sepolia (ERC20 USDC, LZ EID 40245)
 * - Ethereum Sepolia (ERC20 USDC, LZ EID 40161)
 * - Arbitrum Sepolia (ERC20 USDC, LZ EID 40231)
 */

export interface ChainConfig {
    id: number;
    name: string;
    shortName: string;
    lzEid: number; // LayerZero Endpoint ID
    rpc: string;
    explorer: string;
    bridge: string; // PrivateLZBridge address
    deployBlock: number; // Block number when bridge contract was deployed
    stealthRegistry: string;
    transferVerifier: string;
    withdrawVerifier: string;
    poseidonHasher: string;
    usdc: string;
    usdcDecimals: number;
    cctpDomain: number; // CCTP domain ID for this chain
    cctpMessageTransmitter: string; // MessageTransmitterV2 address for receiving CCTP messages
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
}

// LayerZero Endpoint IDs
export const LZ_EIDS = {
    baseSepolia: 40245,
    ethereumSepolia: 40161,
    arbitrumSepolia: 40231,
} as const;

// LayerZero Endpoint address (same on all chains)
export const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

// Chain configurations
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
    // Base Sepolia - ERC20 USDC
    84532: {
        id: 84532,
        name: "Base Sepolia",
        shortName: "Base",
        lzEid: LZ_EIDS.baseSepolia,
        rpc: "https://sepolia.base.org",
        explorer: "https://sepolia.basescan.org",
        // PrivateLZBridge v10.1 (merkle tree fix)
        bridge: "0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1",
        deployBlock: 37366200,
        stealthRegistry: "0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5",
        transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
        withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
        poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        usdcDecimals: 6,
        cctpDomain: 6,
        cctpMessageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
    },
    // Arbitrum Sepolia - ERC20 USDC
    421614: {
        id: 421614,
        name: "Arbitrum Sepolia",
        shortName: "Arbitrum",
        lzEid: LZ_EIDS.arbitrumSepolia,
        rpc: "https://sepolia-rollup.arbitrum.io/rpc",
        explorer: "https://sepolia.arbiscan.io",
        // PrivateLZBridge v10.1 (merkle tree fix)
        bridge: "0x976f28253965A5bA21ad8ada897CC8383cdF206F",
        deployBlock: 240680000,
        stealthRegistry: "",
        transferVerifier: "0xA9FC0Ec2A133abFcf801d8ba4c4eb4fD0C0aF467",
        withdrawVerifier: "0x55B4BcCdeF026c8cbF5AB495A85aa28F235a4Fed",
        poseidonHasher: "0xB83e014c837763C4c86f21C194d7Fb613edFbE2b",
        usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        usdcDecimals: 6,
        cctpDomain: 3,
        cctpMessageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
    },
    // Ethereum Sepolia - ERC20 USDC
    11155111: {
        id: 11155111,
        name: "Ethereum Sepolia",
        shortName: "Sepolia",
        lzEid: LZ_EIDS.ethereumSepolia,
        rpc: "https://ethereum-sepolia-rpc.publicnode.com",
        explorer: "https://sepolia.etherscan.io",
        // PrivateLZBridge v10.1 (merkle tree fix)
        bridge: "0xBe5233d68db3329c62958157854e1FE483d1b4c9",
        deployBlock: 10213180,
        stealthRegistry: "",
        transferVerifier: "0x1F17d25E82B24326D899Cc17b75F7FF3a263f56b",
        withdrawVerifier: "0x96B97C487506813689092b0DD561a2052E7b25C4",
        poseidonHasher: "0xD35f2b612F96149f9869d8Db2B0a63Bef523cb0b",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        usdcDecimals: 6,
        cctpDomain: 0,
        cctpMessageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
        },
    },
};

// Helper functions

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
    return Object.keys(CHAIN_CONFIGS).map(Number);
}

/**
 * Get chain config by ID
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
    return CHAIN_CONFIGS[chainId];
}

/**
 * Get chain config by LayerZero EID
 */
export function getChainByLzEid(lzEid: number): ChainConfig | undefined {
    return Object.values(CHAIN_CONFIGS).find((c) => c.lzEid === lzEid);
}

/**
 * Get LayerZero EID from chain ID
 */
export function getLzEid(chainId: number): number | undefined {
    return CHAIN_CONFIGS[chainId]?.lzEid;
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): boolean {
    return chainId in CHAIN_CONFIGS;
}

/**
 * Get available destination chains from source
 */
export function getDestinationChains(sourceChainId: number): ChainConfig[] {
    return Object.values(CHAIN_CONFIGS).filter((c) => c.id !== sourceChainId);
}

/**
 * Format amount based on chain USDC decimals
 */
export function formatUSDC(amount: bigint, chainId: number): string {
    const config = CHAIN_CONFIGS[chainId];
    if (!config) return "0";

    const decimals = config.usdcDecimals;
    const divisor = BigInt(10 ** decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;

    if (fraction === 0n) {
        return whole.toString();
    }

    const fractionStr = fraction.toString().padStart(decimals, "0");
    const trimmed = fractionStr.replace(/0+$/, "");
    return `${whole}.${trimmed}`;
}

/**
 * Parse USDC amount to wei based on chain
 */
export function parseUSDC(amount: string, chainId: number): bigint {
    const config = CHAIN_CONFIGS[chainId];
    if (!config) return 0n;

    const decimals = config.usdcDecimals;
    const [whole, fraction = ""] = amount.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);

    return BigInt(whole + paddedFraction);
}

/**
 * Get route description
 */
export function getRouteDescription(sourceChainId: number, destChainId: number): string {
    const source = CHAIN_CONFIGS[sourceChainId]?.shortName || "Unknown";
    const dest = CHAIN_CONFIGS[destChainId]?.shortName || "Unknown";
    return `${source} → ${dest}`;
}

// Supported routes (LayerZero: Base Sepolia <-> Ethereum Sepolia)
export const SUPPORTED_ROUTES = [
    { source: 84532, dest: 11155111, name: "Base → Sepolia" },
    { source: 11155111, dest: 84532, name: "Sepolia → Base" },
    { source: 84532, dest: 421614, name: "Base → Arbitrum" },
    { source: 421614, dest: 84532, name: "Arbitrum → Base" },
    { source: 421614, dest: 11155111, name: "Arbitrum → Sepolia" },
    { source: 11155111, dest: 421614, name: "Sepolia → Arbitrum" },
] as const;

/**
 * Wagmi chain definitions for multi-chain support
 */
export const wagmiChainDefinitions = Object.values(CHAIN_CONFIGS).map((config) => ({
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
        default: { http: [config.rpc] },
        public: { http: [config.rpc] },
    },
    blockExplorers: {
        default: { name: config.name, url: config.explorer },
    },
}));
