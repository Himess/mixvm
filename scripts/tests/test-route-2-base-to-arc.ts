/**
 * Test Route 2: Base Sepolia -> Arc Testnet
 *
 * This test deposits USDC on Base Sepolia and initiates cross-chain transfer to Arc.
 *
 * Usage:
 *   npx hardhat run scripts/tests/test-route-2-base-to-arc.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import {
    BRIDGE_ADDRESSES,
    USDC_ADDRESSES,
    CCTP_DOMAINS,
    generateCommitment,
    ERC20_ABI,
} from "./helpers";

async function main() {
    console.log("=".repeat(60));
    console.log("TEST ROUTE 2: Base Sepolia -> Arc Testnet");
    console.log("=".repeat(60));
    console.log();

    // Setup
    const [signer] = await ethers.getSigners();
    console.log("Wallet:", signer.address);

    const ethBalance = await signer.provider.getBalance(signer.address);
    console.log("ETH Balance:", ethers.formatEther(ethBalance), "ETH");

    // Check USDC balance
    const usdcAddress = USDC_ADDRESSES[84532];
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
    const usdcBalance = await usdc.balanceOf(signer.address);
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");
    console.log();

    if (usdcBalance === 0n) {
        console.log("ERROR: No USDC balance on Base Sepolia");
        console.log("Get USDC from Circle faucet: https://faucet.circle.com/");
        return;
    }

    // Check bridge address
    const bridgeAddress = BRIDGE_ADDRESSES[84532];
    if (!bridgeAddress) {
        console.log("ERROR: Bridge address not set for Base Sepolia");
        console.log("Please update BRIDGE_ADDRESSES in helpers.ts after deployment");
        return;
    }

    console.log("Bridge Address:", bridgeAddress);
    console.log("Destination Domain:", CCTP_DOMAINS.arc);
    console.log();

    // Connect to bridge
    const bridge = await ethers.getContractAt("PrivateCCTPBridge", bridgeAddress, signer);

    // Step 1: Approve USDC
    console.log("--- Step 1: Approve USDC ---");
    const depositAmount = ethers.parseUnits("1", 6); // 1 USDC (6 decimals)
    const approveTx = await usdc.approve(bridgeAddress, depositAmount);
    console.log("Approve TX:", approveTx.hash);
    await approveTx.wait();
    console.log("Approved!");
    console.log();

    // Step 2: Deposit
    console.log("--- Step 2: Deposit 1 USDC ---");
    const { commitment, randomness } = generateCommitment(depositAmount);

    console.log("Amount:", ethers.formatUnits(depositAmount, 6), "USDC");
    console.log("Commitment:", commitment);
    console.log("Randomness (save this!):", randomness.toString());

    try {
        const depositTx = await bridge.depositUSDC(commitment, depositAmount, { gasLimit: 300000 });
        console.log("Deposit TX:", depositTx.hash);

        const receipt = await depositTx.wait();
        console.log("Deposit confirmed in block:", receipt?.blockNumber);
    } catch (error: any) {
        console.error("Deposit failed:", error.message);
        return;
    }

    console.log();
    console.log("--- Step 3: Summary ---");
    console.log("Deposit successful!");
    console.log();
    console.log("To complete cross-chain transfer to Arc:");
    console.log("1. Generate ZK proof");
    console.log("2. Call privateTransferCrossChain() with domain=26 (Arc)");
    console.log("3. Wait for CCTP attestation");
    console.log("4. Recipient scans on Arc Testnet");
    console.log();
    console.log("=".repeat(60));
    console.log("TEST ROUTE 2 DEPOSIT COMPLETE");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
