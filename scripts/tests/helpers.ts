import { ethers } from "hardhat";

/**
 * Test helper functions for cross-chain privacy transfers
 */

// CCTP Domain IDs
export const CCTP_DOMAINS = {
    arc: 26,
    baseSepolia: 6,
    ethereumSepolia: 0,
};

// Chain IDs
export const CHAIN_IDS = {
    arc: 5042002,
    baseSepolia: 84532,
    ethereumSepolia: 11155111,
};

// Bridge addresses - ALL DEPLOYED (v2 with correct CCTP addresses)
export const BRIDGE_ADDRESSES: Record<number, string> = {
    5042002: "0xe4467A4622196F74f72D52cc1a8B78Dd1183E881",    // Arc Testnet
    84532: "0x4678D992De548bddCb5Cd4104470766b5207A855",      // Base Sepolia (v2)
    11155111: "0x3FF7bC1C52e7DdD2B7B915bDAdBe003037B0FA2E",   // Ethereum Sepolia (v2)
};

// USDC addresses
export const USDC_ADDRESSES: Record<number, string> = {
    5042002: ethers.ZeroAddress, // Native USDC on Arc
    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

// StealthRegistry addresses
export const STEALTH_REGISTRY_ADDRESSES: Record<number, string> = {
    5042002: "0x137e9693080E9beA3D6cB399EF1Ca33CE72c5477",
    84532: "0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5",
    11155111: "", // Deploy needed
};

// Circle Attestation API
export const CIRCLE_ATTESTATION_API = "https://iris-api-sandbox.circle.com/attestations";

// Bridge ABI for tests
export const BRIDGE_ABI = [
    "function deposit(bytes32 commitment) external payable",
    "function depositUSDC(bytes32 commitment, uint256 amount) external",
    "function privateTransferCrossChain(uint32 destinationDomain, bytes32 nullifier, bytes32 newSenderCommitment, bytes32 recipientCommitment, uint256 amount, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] publicSignals) proof) external returns (uint64)",
    "function withdraw(address recipient, uint256 amount, bytes32 nullifier, bytes32 newCommitment, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[5] publicSignals) proof) external",
    "function getMerkleRoot() external view returns (bytes32)",
    "function getNextLeafIndex() external view returns (uint256)",
    "function isCommitmentExists(bytes32 commitment) external view returns (bool)",
    "function isNullifierUsed(bytes32 nullifier) external view returns (bool)",
    "function getAnnouncementCount() external view returns (uint256)",
    "function localDomain() external view returns (uint32)",
    "event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)",
    "event CrossChainTransferInitiated(uint64 indexed nonce, uint32 indexed destinationDomain, bytes32 recipientCommitment, uint256 amount, bytes32 nullifier)",
];

// ERC20 ABI
export const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
];

/**
 * Simple Poseidon hash for 2 inputs
 * Note: This is a placeholder - actual implementation should use poseidon-lite
 */
export function poseidonHash2(a: bigint, b: bigint): bigint {
    // This is a placeholder - in real tests, use the actual Poseidon hash
    // from poseidon-lite or similar library
    const hash = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [a, b])
    );
    return BigInt(hash) % BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
}

/**
 * Generate a random commitment
 */
export function generateCommitment(balance: bigint): { commitment: string; randomness: bigint } {
    const randomness = BigInt(ethers.hexlify(ethers.randomBytes(31)));
    const hash = poseidonHash2(balance, randomness);
    return {
        commitment: "0x" + hash.toString(16).padStart(64, "0"),
        randomness,
    };
}

/**
 * Generate a nullifier
 */
export function generateNullifier(secret: bigint, commitment: string): string {
    const hash = poseidonHash2(secret, BigInt(commitment));
    return "0x" + hash.toString(16).padStart(64, "0");
}

/**
 * Wait for Circle attestation
 */
export async function waitForAttestation(
    messageHash: string,
    maxWaitMs: number = 600000 // 10 minutes
): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
            const data = await response.json();

            if (data.status === "complete") {
                console.log("Attestation received!");
                return data.attestation;
            }

            console.log(`Waiting for attestation... (${data.status || "pending"})`);
        } catch {
            console.log("Attestation not ready yet...");
        }

        await sleep(15000); // 15 second retry
    }

    throw new Error("Attestation timeout");
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format balance based on decimals
 */
export function formatBalance(balance: bigint, chainId: number): string {
    const decimals = chainId === 5042002 ? 18 : 6;
    return ethers.formatUnits(balance, decimals);
}

/**
 * Parse balance to wei based on chain
 */
export function parseBalance(amount: string, chainId: number): bigint {
    const decimals = chainId === 5042002 ? 18 : 6;
    return ethers.parseUnits(amount, decimals);
}

/**
 * Check wallet balances on all chains
 */
export async function checkWalletBalances(wallet: string): Promise<void> {
    const chains = [
        { name: "Arc Testnet", chainId: 5042002, rpc: "https://arc-testnet.drpc.org", native: "USDC", decimals: 18 },
        { name: "Base Sepolia", chainId: 84532, rpc: "https://sepolia.base.org", native: "ETH", decimals: 18 },
        { name: "Ethereum Sepolia", chainId: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com", native: "ETH", decimals: 18 },
    ];

    console.log("\n=== Wallet Balances ===");
    console.log(`Wallet: ${wallet}\n`);

    for (const chain of chains) {
        const provider = new ethers.JsonRpcProvider(chain.rpc);
        const nativeBalance = await provider.getBalance(wallet);

        console.log(`${chain.name}:`);
        console.log(`  ${chain.native}: ${ethers.formatUnits(nativeBalance, chain.decimals)}`);

        // Check USDC for non-Arc chains
        if (chain.chainId !== 5042002) {
            const usdcAddress = USDC_ADDRESSES[chain.chainId];
            if (usdcAddress) {
                const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
                const usdcBalance = await usdc.balanceOf(wallet);
                console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
            }
        }
        console.log();
    }
}

/**
 * Get chain name from ID
 */
export function getChainName(chainId: number): string {
    const names: Record<number, string> = {
        5042002: "Arc Testnet",
        84532: "Base Sepolia",
        11155111: "Ethereum Sepolia",
    };
    return names[chainId] || `Chain ${chainId}`;
}

/**
 * Get domain from chain ID
 */
export function getDomain(chainId: number): number {
    const domains: Record<number, number> = {
        5042002: 26,
        84532: 6,
        11155111: 0,
    };
    return domains[chainId] ?? -1;
}

/**
 * Get chain ID from domain
 */
export function getChainId(domain: number): number {
    const chainIds: Record<number, number> = {
        26: 5042002,
        6: 84532,
        0: 11155111,
    };
    return chainIds[domain] ?? -1;
}

/**
 * Mock stealth data for testing
 */
export function generateMockStealthData(): {
    ephemeralPubKeyX: bigint;
    ephemeralPubKeyY: bigint;
    stealthAddressX: bigint;
    stealthAddressY: bigint;
    viewTag: bigint;
} {
    return {
        ephemeralPubKeyX: BigInt(ethers.hexlify(ethers.randomBytes(31))),
        ephemeralPubKeyY: BigInt(ethers.hexlify(ethers.randomBytes(31))),
        stealthAddressX: BigInt(ethers.hexlify(ethers.randomBytes(31))),
        stealthAddressY: BigInt(ethers.hexlify(ethers.randomBytes(31))),
        viewTag: BigInt(Math.floor(Math.random() * 1000000)),
    };
}

/**
 * Mock audit data for testing
 */
export function generateMockAuditData(): {
    encryptedSender: [bigint, bigint, bigint, bigint];
    encryptedRecipient: [bigint, bigint, bigint, bigint];
    encryptedAmount: [bigint, bigint, bigint, bigint];
} {
    return {
        encryptedSender: [0n, 0n, 0n, 0n],
        encryptedRecipient: [0n, 0n, 0n, 0n],
        encryptedAmount: [0n, 0n, 0n, 0n],
    };
}

/**
 * Mock proof data for testing
 * Note: This won't pass verification - for testing infrastructure only
 */
export function generateMockProofData(merkleRoot: string): {
    pA: [bigint, bigint];
    pB: [[bigint, bigint], [bigint, bigint]];
    pC: [bigint, bigint];
    publicSignals: [bigint, bigint, bigint, bigint];
} {
    return {
        pA: [0n, 0n],
        pB: [[0n, 0n], [0n, 0n]],
        pC: [0n, 0n],
        publicSignals: [BigInt(merkleRoot), 0n, 0n, 0n],
    };
}
