import { ethers } from "hardhat";

/**
 * Deploy PrivateCCTPBridge to the current network
 *
 * Usage:
 *   npx hardhat run scripts/deploy-private-cctp-bridge.ts --network arcTestnet
 *   npx hardhat run scripts/deploy-private-cctp-bridge.ts --network baseSepolia
 *   npx hardhat run scripts/deploy-private-cctp-bridge.ts --network ethereumSepolia
 */

// Chain configurations
const CHAIN_CONFIGS: Record<number, {
    name: string;
    domain: number;
    tokenMessenger: string;
    messageTransmitter: string;
    usdc: string;
    isNativeUSDC: boolean;
}> = {
    // Arc Testnet - USDC is native gas token but has ERC-20 wrapper for CCTP
    // Native USDC: 18 decimals (gas token)
    // ERC-20 USDC: 6 decimals (CCTP compatible wrapper at 0x360...)
    // We use the ERC-20 wrapper for standard CCTP depositForBurn()
    5042002: {
        name: "Arc Testnet",
        domain: 26,
        tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        usdc: "0x3600000000000000000000000000000000000000", // USDC ERC-20 wrapper (6 decimals)
        isNativeUSDC: false, // Use standard CCTP depositForBurn() with ERC-20 wrapper
    },
    // Base Sepolia - ERC20 USDC (Official Circle CCTP addresses)
    84532: {
        name: "Base Sepolia",
        domain: 6,
        tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
        messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        isNativeUSDC: false,
    },
    // Ethereum Sepolia - ERC20 USDC (Official Circle CCTP addresses)
    11155111: {
        name: "Ethereum Sepolia",
        domain: 0,
        tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
        messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        isNativeUSDC: false,
    },
};

// Existing verifier contracts (will be reused or need to be deployed)
const EXISTING_CONTRACTS: Record<number, {
    transferVerifier?: string;
    withdrawVerifier?: string;
    poseidonHasher?: string;
}> = {
    5042002: {
        transferVerifier: "0xb7438C9Cf91cE85f7C261048149d5aF03b9A12CC",
        withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
        poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
    },
    84532: {
        transferVerifier: "0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B",
        withdrawVerifier: "0x4aC6108858A2ba9C715d3E1694d413b01919A043",
        poseidonHasher: "0xF900978c52C9773C40Df173802f66922D57FDCec",
    },
    11155111: {
        // Ethereum Sepolia - already deployed
        transferVerifier: "0xE8D84bfD8756547BE86265cDE8CdBcd8cdfC8a13",
        withdrawVerifier: "0x4F86E124097705bCb2B707Ea40Fc66d65B31ebee",
        poseidonHasher: "0x68c0175e9d9C6d39fC2278165C3Db93d484a5361",
    },
};

async function deployVerifiers(chainId: number): Promise<{
    transferVerifier: string;
    withdrawVerifier: string;
    poseidonHasher: string;
}> {
    const existing = EXISTING_CONTRACTS[chainId];

    let transferVerifier = existing?.transferVerifier;
    let withdrawVerifier = existing?.withdrawVerifier;
    let poseidonHasher = existing?.poseidonHasher;

    // Deploy PoseidonHasher if needed
    if (!poseidonHasher) {
        console.log("  Deploying PoseidonHasher...");
        const PoseidonHasher = await ethers.getContractFactory("PoseidonHasher");
        const hasher = await PoseidonHasher.deploy();
        await hasher.waitForDeployment();
        poseidonHasher = await hasher.getAddress();
        console.log("  PoseidonHasher deployed to:", poseidonHasher);
    }

    // Deploy TransferVerifier if needed
    if (!transferVerifier) {
        console.log("  Deploying Groth16Verifier (Transfer)...");
        const Verifier = await ethers.getContractFactory("contracts/PrivateTransferVerifier.sol:Groth16Verifier");
        const verifier = await Verifier.deploy();
        await verifier.waitForDeployment();
        transferVerifier = await verifier.getAddress();
        console.log("  TransferVerifier deployed to:", transferVerifier);
    }

    // Deploy WithdrawVerifier if needed
    if (!withdrawVerifier) {
        console.log("  Deploying WithdrawVerifier...");
        const WithdrawVerifier = await ethers.getContractFactory("WithdrawVerifier");
        const verifier = await WithdrawVerifier.deploy();
        await verifier.waitForDeployment();
        withdrawVerifier = await verifier.getAddress();
        console.log("  WithdrawVerifier deployed to:", withdrawVerifier);
    }

    return {
        transferVerifier: transferVerifier!,
        withdrawVerifier: withdrawVerifier!,
        poseidonHasher: poseidonHasher!,
    };
}

async function main() {
    console.log("=".repeat(60));
    console.log("PrivateCCTPBridge Deployment Script");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("\nNetwork:", chainId);
    console.log("Deployer:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), chainId === 5042002 ? "USDC" : "ETH");

    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
        console.error("Unsupported network:", chainId);
        process.exit(1);
    }

    console.log("\nChain Config:");
    console.log("  Name:", config.name);
    console.log("  CCTP Domain:", config.domain);
    console.log("  Is Native USDC:", config.isNativeUSDC);
    console.log("  TokenMessenger:", config.tokenMessenger);
    console.log("  MessageTransmitter:", config.messageTransmitter);
    console.log("  USDC:", config.usdc);

    // Deploy or use existing verifiers
    console.log("\n1. Deploying/Using Verifiers...");
    const verifiers = await deployVerifiers(chainId);
    console.log("  TransferVerifier:", verifiers.transferVerifier);
    console.log("  WithdrawVerifier:", verifiers.withdrawVerifier);
    console.log("  PoseidonHasher:", verifiers.poseidonHasher);

    // Deploy PrivateCCTPBridge
    console.log("\n2. Deploying PrivateCCTPBridge...");
    const PrivateCCTPBridge = await ethers.getContractFactory("PrivateCCTPBridge");
    const bridge = await PrivateCCTPBridge.deploy(
        verifiers.transferVerifier,
        verifiers.withdrawVerifier,
        verifiers.poseidonHasher,
        config.tokenMessenger,
        config.messageTransmitter,
        config.usdc,
        config.isNativeUSDC,
        config.domain,
        deployer.address // admin
    );

    await bridge.waitForDeployment();
    const bridgeAddress = await bridge.getAddress();

    console.log("  PrivateCCTPBridge deployed to:", bridgeAddress);

    // Verify deployment
    console.log("\n3. Verifying deployment...");
    const localDomain = await bridge.localDomain();
    const isNative = await bridge.isNativeUSDC();
    const admin = await bridge.admin();
    const merkleRoot = await bridge.getMerkleRoot();

    console.log("  Local Domain:", localDomain.toString());
    console.log("  Is Native USDC:", isNative);
    console.log("  Admin:", admin);
    console.log("  Initial Merkle Root:", merkleRoot);

    // Output summary
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log(`Chain: ${config.name} (${chainId})`);
    console.log(`CCTP Domain: ${config.domain}`);
    console.log(`\nContracts:`);
    console.log(`  PrivateCCTPBridge: ${bridgeAddress}`);
    console.log(`  TransferVerifier:  ${verifiers.transferVerifier}`);
    console.log(`  WithdrawVerifier:  ${verifiers.withdrawVerifier}`);
    console.log(`  PoseidonHasher:    ${verifiers.poseidonHasher}`);
    console.log("\n" + "=".repeat(60));
    console.log("UPDATE THIS IN webapp/src/lib/chains.ts");
    console.log("=".repeat(60));

    // Output for easy copy-paste
    console.log(`
// ${config.name}
{
    chainId: ${chainId},
    domain: ${config.domain},
    bridge: "${bridgeAddress}",
    transferVerifier: "${verifiers.transferVerifier}",
    withdrawVerifier: "${verifiers.withdrawVerifier}",
    poseidonHasher: "${verifiers.poseidonHasher}",
}
`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
