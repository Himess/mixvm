/**
 * Multi-chain configuration for the MixVM privacy bridge
 *
 * Supported chains:
 * - Arc Testnet (Native USDC, CCTP Domain 26)
 * - Base Sepolia (ERC20 USDC, CCTP Domain 6)
 * - Ethereum Sepolia (ERC20 USDC, CCTP Domain 0)
 */

export interface ChainConfig {
    id: number;
    name: string;
    shortName: string;
    domain: number; // CCTP Domain ID
    rpc: string;
    explorer: string;
    bridge: string; // PrivateCCTPBridge address
    stealthRegistry: string;
    transferVerifier: string;
    withdrawVerifier: string;
    poseidonHasher: string;
    usdc: string; // ERC20 USDC address (empty for Arc native)
    isNativeUSDC: boolean;
    usdcDecimals: number;
    tokenMessenger: string;
    messageTransmitter: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
}

// CCTP Domain IDs
export const CCTP_DOMAINS = {
    ethereumSepolia: 0,
    baseSepolia: 6,
    arcTestnet: 26,
} as const;

// Chain configurations
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
    // Arc Testnet - ERC-20 USDC wrapper for CCTP compatibility
    5042002: {
        id: 5042002,
        name: "Arc Testnet",
        shortName: "Arc",
        domain: CCTP_DOMAINS.arcTestnet,
        rpc: "https://arc-testnet.drpc.org",
        explorer: "https://testnet.arcscan.io",
        // Contract addresses - DEPLOYED (CCTP V2 + ERC-20 Wrapper - Jan 2026)
        bridge: "0x75d0eeEE3288D875Dd60A0066437ed12445b0C03",
        stealthRegistry: "0x137e9693080E9beA3D6cB399EF1Ca33CE72c5477",
        transferVerifier: "0xb7438C9Cf91cE85f7C261048149d5aF03b9A12CC",
        withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
        poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
        usdc: "0x3600000000000000000000000000000000000000", // ERC-20 USDC wrapper
        isNativeUSDC: false,
        usdcDecimals: 6,
        // CCTP contracts
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        nativeCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 18,
        },
    },
    // Base Sepolia - ERC20 USDC
    84532: {
        id: 84532,
        name: "Base Sepolia",
        shortName: "Base",
        domain: CCTP_DOMAINS.baseSepolia,
        rpc: "https://sepolia.base.org",
        explorer: "https://sepolia.basescan.org",
        // Contract addresses - DEPLOYED (CCTP V2 - Jan 2026) - v11 fixed void return
        bridge: "0xDF93773761102e0cbc6b90Fa04699e7f26Ac28c9",
        stealthRegistry: "0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5",
        transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
        withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
        poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        isNativeUSDC: false,
        usdcDecimals: 6,
        // CCTP V2 contracts (official Circle addresses)
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
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
        domain: CCTP_DOMAINS.ethereumSepolia,
        rpc: "https://ethereum-sepolia-rpc.publicnode.com",
        explorer: "https://sepolia.etherscan.io",
        // Contract addresses - DEPLOYED (CCTP V2 - Jan 2026)
        bridge: "0x394222B73b295374b951B79d5f6796b463392f87",
        stealthRegistry: "", // Not needed for bridge
        transferVerifier: "0xE8D84bfD8756547BE86265cDE8CdBcd8cdfC8a13",
        withdrawVerifier: "0x4F86E124097705bCb2B707Ea40Fc66d65B31ebee",
        poseidonHasher: "0x68c0175e9d9C6d39fC2278165C3Db93d484a5361",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        isNativeUSDC: false,
        usdcDecimals: 6,
        // CCTP contracts
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
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
 * Get chain config by CCTP domain
 */
export function getChainByDomain(domain: number): ChainConfig | undefined {
    return Object.values(CHAIN_CONFIGS).find((c) => c.domain === domain);
}

/**
 * Get CCTP domain from chain ID
 */
export function getDomain(chainId: number): number | undefined {
    return CHAIN_CONFIGS[chainId]?.domain;
}

/**
 * Get chain ID from CCTP domain
 */
export function getChainId(domain: number): number | undefined {
    const chain = getChainByDomain(domain);
    return chain?.id;
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

// All 6 supported routes
export const SUPPORTED_ROUTES = [
    { source: 5042002, dest: 84532, name: "Arc → Base" },
    { source: 5042002, dest: 11155111, name: "Arc → Sepolia" },
    { source: 84532, dest: 5042002, name: "Base → Arc" },
    { source: 84532, dest: 11155111, name: "Base → Sepolia" },
    { source: 11155111, dest: 5042002, name: "Sepolia → Arc" },
    { source: 11155111, dest: 84532, name: "Sepolia → Base" },
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
