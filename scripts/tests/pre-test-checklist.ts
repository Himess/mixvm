import { ethers } from "hardhat";

/**
 * Pre-test checklist - verify wallet has sufficient funds on all chains
 *
 * Usage:
 *   npx hardhat run scripts/tests/pre-test-checklist.ts
 */

const WALLET = process.env.WALLET_ADDRESS || "";

const CHAINS = [
    {
        name: "Arc Testnet",
        chainId: 5042002,
        rpc: "https://arc-testnet.drpc.org",
        nativeSymbol: "USDC",
        nativeDecimals: 18,
        minRequired: "0.1", // 0.1 USDC for tests
        usdc: null as string | null, // Native is USDC
    },
    {
        name: "Base Sepolia",
        chainId: 84532,
        rpc: "https://sepolia.base.org",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        minRequired: "0.01", // 0.01 ETH for gas
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        usdcMin: "1", // 1 USDC for tests
    },
    {
        name: "Ethereum Sepolia",
        chainId: 11155111,
        rpc: "https://ethereum-sepolia-rpc.publicnode.com",
        nativeSymbol: "ETH",
        nativeDecimals: 18,
        minRequired: "0.01",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        usdcMin: "1",
    },
];

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
];

async function main() {
    console.log("=".repeat(60));
    console.log("PRE-TEST WALLET BALANCE CHECK");
    console.log("=".repeat(60));

    // Get wallet address
    let wallet = WALLET;
    if (!wallet) {
        const [signer] = await ethers.getSigners();
        wallet = signer.address;
    }

    console.log(`\nWallet: ${wallet}\n`);

    let allReady = true;
    const issues: string[] = [];

    for (const chain of CHAINS) {
        console.log(`${chain.name} (${chain.chainId})`);
        console.log("-".repeat(40));

        const provider = new ethers.JsonRpcProvider(chain.rpc);

        // Native balance
        const nativeBalance = await provider.getBalance(wallet);
        const nativeFormatted = ethers.formatUnits(nativeBalance, chain.nativeDecimals);
        const nativeOk = parseFloat(nativeFormatted) >= parseFloat(chain.minRequired);

        const nativeStatus = nativeOk ? "[OK]" : `[NEED ${chain.minRequired}]`;
        console.log(`  ${chain.nativeSymbol}: ${nativeFormatted} ${nativeStatus}`);

        if (!nativeOk) {
            allReady = false;
            issues.push(`${chain.name}: Need ${chain.minRequired} ${chain.nativeSymbol}`);
        }

        // USDC balance (if separate token)
        if (chain.usdc) {
            const usdc = new ethers.Contract(chain.usdc, ERC20_ABI, provider);
            const usdcBalance = await usdc.balanceOf(wallet);
            const usdcFormatted = ethers.formatUnits(usdcBalance, 6);
            const usdcOk = parseFloat(usdcFormatted) >= parseFloat(chain.usdcMin || "0");

            const usdcStatus = usdcOk ? "[OK]" : `[NEED ${chain.usdcMin}]`;
            console.log(`  USDC: ${usdcFormatted} ${usdcStatus}`);

            if (!usdcOk) {
                allReady = false;
                issues.push(`${chain.name}: Need ${chain.usdcMin} USDC`);
            }
        }

        console.log();
    }

    // Summary
    console.log("=".repeat(60));
    if (allReady) {
        console.log("STATUS: READY FOR TESTING");
        console.log("All balances are sufficient.");
    } else {
        console.log("STATUS: NOT READY");
        console.log("\nIssues:");
        for (const issue of issues) {
            console.log(`  - ${issue}`);
        }
        console.log("\nFunding options:");
        console.log("  Arc USDC:     Should already have from previous deposits");
        console.log("  Base ETH:     Should already have from faucet");
        console.log("  Sepolia ETH:  Bridge from Base or use faucet:");
        console.log("                - https://www.alchemy.com/faucets/ethereum-sepolia");
        console.log("                - https://faucet.quicknode.com/ethereum/sepolia");
        console.log("  USDC:         https://faucet.circle.com/");
    }
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
