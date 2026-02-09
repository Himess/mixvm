/**
 * Test Route 3: Arc Testnet -> Ethereum Sepolia
 *
 * Usage:
 *   npx hardhat run scripts/tests/test-route-3-arc-to-ethereum.ts --network arcTestnet
 */

import { ethers } from "hardhat";
import { BRIDGE_ADDRESSES, CCTP_DOMAINS, generateCommitment } from "./helpers";

async function main() {
    console.log("=".repeat(60));
    console.log("TEST ROUTE 3: Arc Testnet -> Ethereum Sepolia");
    console.log("=".repeat(60));

    const [signer] = await ethers.getSigners();
    console.log("Wallet:", signer.address);

    const balance = await signer.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatUnits(balance, 18), "USDC");

    const bridgeAddress = BRIDGE_ADDRESSES[5042002];
    if (!bridgeAddress) {
        console.log("ERROR: Bridge address not set. Deploy first.");
        return;
    }

    console.log("Bridge:", bridgeAddress);
    console.log("Destination Domain:", CCTP_DOMAINS.ethereumSepolia, "(Ethereum Sepolia)");

    // Deposit
    const depositAmount = ethers.parseUnits("1", 18);
    const { commitment, randomness } = generateCommitment(depositAmount);

    console.log("\nDepositing 1 USDC...");
    console.log("Commitment:", commitment);
    console.log("Randomness:", randomness.toString());

    const bridge = await ethers.getContractAt("PrivateCCTPBridge", bridgeAddress, signer);
    const tx = await bridge.deposit(commitment, { value: depositAmount, gasLimit: 300000 });
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("Deposit complete!");

    console.log("\nNext: Call privateTransferCrossChain with domain=0");
    console.log("=".repeat(60));
}

main().catch(console.error);
