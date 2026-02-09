/**
 * Test All 6 Routes - Summary and Pre-flight Check
 *
 * This script checks wallet balances and bridge configurations for all routes.
 *
 * Usage:
 *   npx hardhat run scripts/tests/test-all-routes.ts
 */

import { ethers } from "hardhat";

// Configuration
const CHAINS = [
    {
        name: "Arc Testnet",
        chainId: 5042002,
        domain: 26,
        rpc: "https://arc-testnet.drpc.org",
        nativeSymbol: "USDC",
        nativeDecimals: 18,
        usdc: null, // Native
        bridgeAddress: "", // UPDATE AFTER DEPLOYMENT
    },
    {
        name: "Base Sepolia",
        chainId: 84532,
        domain: 6,
        rpc: "https://sepolia.base.org",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        bridgeAddress: "", // UPDATE AFTER DEPLOYMENT
    },
    {
        name: "Ethereum Sepolia",
        chainId: 11155111,
        domain: 0,
        rpc: "https://ethereum-sepolia-rpc.publicnode.com",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        bridgeAddress: "", // UPDATE AFTER DEPLOYMENT
    },
];

const ROUTES = [
    { id: 1, from: "Arc Testnet", to: "Base Sepolia", network: "arcTestnet" },
    { id: 2, from: "Base Sepolia", to: "Arc Testnet", network: "baseSepolia" },
    { id: 3, from: "Arc Testnet", to: "Ethereum Sepolia", network: "arcTestnet" },
    { id: 4, from: "Ethereum Sepolia", to: "Arc Testnet", network: "ethereumSepolia" },
    { id: 5, from: "Base Sepolia", to: "Ethereum Sepolia", network: "baseSepolia" },
    { id: 6, from: "Ethereum Sepolia", to: "Base Sepolia", network: "ethereumSepolia" },
];

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
    console.log("=".repeat(70));
    console.log("  MixVM CROSS-CHAIN PRIVACY BRIDGE - ALL ROUTES TEST");
    console.log("=".repeat(70));
    console.log();

    const [signer] = await ethers.getSigners();
    console.log("Wallet Address:", signer.address);
    console.log();

    // Check balances on all chains
    console.log("--- WALLET BALANCES ---");
    console.log("-".repeat(50));

    for (const chain of CHAINS) {
        const provider = new ethers.JsonRpcProvider(chain.rpc);
        const nativeBalance = await provider.getBalance(signer.address);

        console.log(`\n${chain.name} (Chain ID: ${chain.chainId}, Domain: ${chain.domain})`);
        console.log(`  ${chain.nativeSymbol}: ${ethers.formatUnits(nativeBalance, chain.nativeDecimals)}`);

        if (chain.usdc) {
            const usdc = new ethers.Contract(chain.usdc, ERC20_ABI, provider);
            const usdcBalance = await usdc.balanceOf(signer.address);
            console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
        }

        if (chain.bridgeAddress) {
            console.log(`  Bridge: ${chain.bridgeAddress}`);
        } else {
            console.log(`  Bridge: NOT DEPLOYED`);
        }
    }

    // Check routes
    console.log();
    console.log("-".repeat(50));
    console.log("--- SUPPORTED ROUTES ---");
    console.log("-".repeat(50));
    console.log();

    for (const route of ROUTES) {
        const fromChain = CHAINS.find((c) => c.name === route.from);
        const toChain = CHAINS.find((c) => c.name === route.to);

        const fromReady = fromChain?.bridgeAddress ? "READY" : "NEED DEPLOY";
        const toReady = toChain?.bridgeAddress ? "READY" : "NEED DEPLOY";
        const status = fromReady === "READY" && toReady === "READY" ? "[OK]" : "[PENDING]";

        console.log(
            `Route ${route.id}: ${route.from} -> ${route.to} ${status}`
        );
        console.log(`         Domain: ${fromChain?.domain} -> ${toChain?.domain}`);
        console.log(`         Network: --network ${route.network}`);
        console.log();
    }

    // Test commands
    console.log("-".repeat(50));
    console.log("--- TEST COMMANDS ---");
    console.log("-".repeat(50));
    console.log();
    console.log("To test each route after deployment:");
    console.log();
    console.log("npx hardhat run scripts/tests/test-route-1-arc-to-base.ts --network arcTestnet");
    console.log("npx hardhat run scripts/tests/test-route-2-base-to-arc.ts --network baseSepolia");
    console.log("npx hardhat run scripts/tests/test-route-3-arc-to-ethereum.ts --network arcTestnet");
    console.log("npx hardhat run scripts/tests/test-route-4-ethereum-to-arc.ts --network ethereumSepolia");
    console.log("npx hardhat run scripts/tests/test-route-5-base-to-ethereum.ts --network baseSepolia");
    console.log("npx hardhat run scripts/tests/test-route-6-ethereum-to-base.ts --network ethereumSepolia");
    console.log();

    // Deployment instructions
    console.log("-".repeat(50));
    console.log("--- DEPLOYMENT STEPS ---");
    console.log("-".repeat(50));
    console.log();
    console.log("1. Deploy PrivateCCTPBridge to each chain:");
    console.log("   npx hardhat run scripts/deploy-private-cctp-bridge.ts --network arcTestnet");
    console.log("   npx hardhat run scripts/deploy-private-cctp-bridge.ts --network baseSepolia");
    console.log("   npx hardhat run scripts/deploy-private-cctp-bridge.ts --network ethereumSepolia");
    console.log();
    console.log("2. Update bridge addresses in:");
    console.log("   - scripts/tests/helpers.ts (BRIDGE_ADDRESSES)");
    console.log("   - webapp/src/lib/chains.ts (bridge field)");
    console.log("   - scripts/cross-register-bridges.ts (BRIDGE_ADDRESSES)");
    console.log();
    console.log("3. Cross-register bridges:");
    console.log("   npx hardhat run scripts/cross-register-bridges.ts --network arcTestnet");
    console.log("   npx hardhat run scripts/cross-register-bridges.ts --network baseSepolia");
    console.log("   npx hardhat run scripts/cross-register-bridges.ts --network ethereumSepolia");
    console.log();
    console.log("4. Start CCTP relayer:");
    console.log("   cd relayer && npm run start:cctp");
    console.log();

    console.log("=".repeat(70));
    console.log("  PRE-FLIGHT CHECK COMPLETE");
    console.log("=".repeat(70));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
