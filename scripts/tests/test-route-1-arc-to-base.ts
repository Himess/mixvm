/**
 * Test Route 1: Arc Testnet -> Base Sepolia
 *
 * This test deposits on Arc and initiates a cross-chain transfer to Base Sepolia.
 *
 * Usage:
 *   npx hardhat run scripts/tests/test-route-1-arc-to-base.ts --network arcTestnet
 */

import { ethers } from "hardhat";
import {
    BRIDGE_ADDRESSES,
    CCTP_DOMAINS,
    generateCommitment,
    generateMockStealthData,
    generateMockAuditData,
    checkWalletBalances,
} from "./helpers";

async function main() {
    console.log("=".repeat(60));
    console.log("TEST ROUTE 1: Arc Testnet -> Base Sepolia");
    console.log("=".repeat(60));
    console.log();

    // Setup
    const [signer] = await ethers.getSigners();
    console.log("Wallet:", signer.address);

    const balance = await signer.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatUnits(balance, 18), "USDC");
    console.log();

    // Check bridge address
    const bridgeAddress = BRIDGE_ADDRESSES[5042002];
    if (!bridgeAddress) {
        console.log("ERROR: Bridge address not set for Arc Testnet");
        console.log("Please update BRIDGE_ADDRESSES in helpers.ts after deployment");
        return;
    }

    console.log("Bridge Address:", bridgeAddress);
    console.log("Destination Domain:", CCTP_DOMAINS.baseSepolia);
    console.log();

    // Connect to bridge
    const bridge = await ethers.getContractAt("PrivateCCTPBridge", bridgeAddress, signer);

    // Step 1: Check current state
    console.log("--- Step 1: Check Bridge State ---");
    const merkleRoot = await bridge.getMerkleRoot();
    const nextLeafIndex = await bridge.getNextLeafIndex();
    console.log("Current Merkle Root:", merkleRoot);
    console.log("Next Leaf Index:", nextLeafIndex.toString());
    console.log();

    // Step 2: Deposit
    console.log("--- Step 2: Deposit 1 USDC ---");
    const depositAmount = ethers.parseUnits("1", 18);
    const { commitment, randomness } = generateCommitment(depositAmount);

    console.log("Amount:", ethers.formatUnits(depositAmount, 18), "USDC");
    console.log("Commitment:", commitment);
    console.log("Randomness (save this!):", randomness.toString());

    try {
        // Use high gas limit - Arc network needs more gas
        const depositTx = await bridge.deposit(commitment, { value: depositAmount, gasLimit: 1000000 });
        console.log("Deposit TX:", depositTx.hash);

        const receipt = await depositTx.wait();
        console.log("Deposit confirmed in block:", receipt?.blockNumber);

        // Parse events
        const depositedEvent = receipt?.logs.find((log: any) => {
            try {
                const parsed = bridge.interface.parseLog({ topics: log.topics as string[], data: log.data });
                return parsed?.name === "Deposited";
            } catch {
                return false;
            }
        });

        if (depositedEvent) {
            const parsed = bridge.interface.parseLog({
                topics: depositedEvent.topics as string[],
                data: depositedEvent.data,
            });
            console.log("Leaf Index:", parsed?.args.leafIndex.toString());
        }
    } catch (error: any) {
        console.error("Deposit failed:", error.message);
        return;
    }

    console.log();
    console.log("--- Step 3: Summary ---");
    console.log("Deposit successful!");
    console.log();
    console.log("To complete cross-chain transfer, you need to:");
    console.log("1. Generate ZK proof using the commitment data");
    console.log("2. Call privateTransferCrossChain() with proof");
    console.log("3. Wait for CCTP attestation (~10-20 mins on testnet)");
    console.log("4. Recipient scans on Base Sepolia");
    console.log();
    console.log("=".repeat(60));
    console.log("TEST ROUTE 1 DEPOSIT COMPLETE");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
