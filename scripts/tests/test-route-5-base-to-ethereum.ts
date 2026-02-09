/**
 * Test Route 5: Base Sepolia -> Ethereum Sepolia
 *
 * Usage:
 *   npx hardhat run scripts/tests/test-route-5-base-to-ethereum.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import { BRIDGE_ADDRESSES, USDC_ADDRESSES, CCTP_DOMAINS, generateCommitment, ERC20_ABI } from "./helpers";

async function main() {
    console.log("=".repeat(60));
    console.log("TEST ROUTE 5: Base Sepolia -> Ethereum Sepolia");
    console.log("=".repeat(60));

    const [signer] = await ethers.getSigners();
    console.log("Wallet:", signer.address);

    const ethBalance = await signer.provider.getBalance(signer.address);
    console.log("ETH Balance:", ethers.formatEther(ethBalance), "ETH");

    const usdcAddress = USDC_ADDRESSES[84532];
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
    const usdcBalance = await usdc.balanceOf(signer.address);
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

    if (usdcBalance === 0n) {
        console.log("ERROR: No USDC. Get from https://faucet.circle.com/");
        return;
    }

    const bridgeAddress = BRIDGE_ADDRESSES[84532];
    if (!bridgeAddress) {
        console.log("ERROR: Bridge address not set. Deploy first.");
        return;
    }

    console.log("Bridge:", bridgeAddress);
    console.log("Destination Domain:", CCTP_DOMAINS.ethereumSepolia, "(Ethereum Sepolia)");

    const depositAmount = ethers.parseUnits("1", 6);
    const { commitment, randomness } = generateCommitment(depositAmount);

    console.log("\nApproving USDC...");
    await (await usdc.approve(bridgeAddress, depositAmount)).wait();

    console.log("Depositing 1 USDC...");
    console.log("Commitment:", commitment);
    console.log("Randomness:", randomness.toString());

    const bridge = await ethers.getContractAt("PrivateCCTPBridge", bridgeAddress, signer);
    const tx = await bridge.depositUSDC(commitment, depositAmount, { gasLimit: 300000 });
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("Deposit complete!");

    console.log("\nNext: Call privateTransferCrossChain with domain=0 (Ethereum)");
    console.log("=".repeat(60));
}

main().catch(console.error);
