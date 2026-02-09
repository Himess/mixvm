import { ethers } from "hardhat";

/**
 * Cross-register PrivateCCTPBridge contracts across all chains
 *
 * This script sets up the destination contracts and authorized sources
 * so each bridge can send to and receive from the other two chains.
 *
 * Usage:
 *   npx hardhat run scripts/cross-register-bridges.ts --network arcTestnet
 *   npx hardhat run scripts/cross-register-bridges.ts --network baseSepolia
 *   npx hardhat run scripts/cross-register-bridges.ts --network ethereumSepolia
 */

// CCTP Domain IDs
const CCTP_DOMAINS = {
    arc: 26,
    baseSepolia: 6,
    ethereumSepolia: 0,
};

// Bridge addresses - ALL DEPLOYED (CCTP V2 + ERC-20 Wrapper - Jan 2026)
const BRIDGE_ADDRESSES: Record<number, string> = {
    5042002: "0x75d0eeEE3288D875Dd60A0066437ed12445b0C03",    // Arc Testnet (v5 - ERC-20 USDC wrapper)
    84532: "0xA9FC0Ec2A133abFcf801d8ba4c4eb4fD0C0aF467",      // Base Sepolia (v3)
    11155111: "0x394222B73b295374b951B79d5f6796b463392f87",   // Ethereum Sepolia (v3)
};

// Domain to ChainId mapping
const DOMAIN_TO_CHAIN: Record<number, number> = {
    26: 5042002,     // Arc
    6: 84532,        // Base Sepolia
    0: 11155111,     // Ethereum Sepolia
};

// Chain to Domain mapping
const CHAIN_TO_DOMAIN: Record<number, number> = {
    5042002: 26,     // Arc
    84532: 6,        // Base Sepolia
    11155111: 0,     // Ethereum Sepolia
};

const BRIDGE_ABI = [
    "function setDestinationContract(uint32 domain, bytes32 contractAddress) external",
    "function setAuthorizedSource(uint32 domain, bytes32 sourceContract) external",
    "function getDestinationContract(uint32 domain) external view returns (bytes32)",
    "function getAuthorizedSource(uint32 domain) external view returns (bytes32)",
    "function localDomain() external view returns (uint32)",
    "function admin() external view returns (address)",
];

function addressToBytes32(address: string): string {
    return ethers.zeroPadValue(address, 32);
}

async function main() {
    console.log("=".repeat(60));
    console.log("Cross-Register PrivateCCTPBridge Contracts");
    console.log("=".repeat(60));

    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const currentChainId = Number(network.chainId);
    const currentDomain = CHAIN_TO_DOMAIN[currentChainId];

    console.log("\nCurrent Chain:", currentChainId);
    console.log("Current Domain:", currentDomain);
    console.log("Signer:", signer.address);

    // Validate current bridge address is set
    // Note: Other chains may not be deployed yet, we'll skip them

    const currentBridgeAddress = BRIDGE_ADDRESSES[currentChainId];
    if (!currentBridgeAddress) {
        console.error("No bridge address for current chain");
        process.exit(1);
    }

    console.log("\nCurrent Bridge:", currentBridgeAddress);

    // Connect to current bridge
    const bridge = new ethers.Contract(currentBridgeAddress, BRIDGE_ABI, signer);

    // Verify admin
    const admin = await bridge.admin();
    if (admin.toLowerCase() !== signer.address.toLowerCase()) {
        console.error("Signer is not admin of this bridge!");
        console.error("Admin:", admin);
        console.error("Signer:", signer.address);
        process.exit(1);
    }

    // Get other chains to register (skip chains without deployed bridges)
    const otherChains = Object.entries(BRIDGE_ADDRESSES)
        .filter(([chainId, address]) => Number(chainId) !== currentChainId && address && address !== "");

    console.log("\nRegistering other chains:");
    console.log("-".repeat(40));

    for (const [chainIdStr, bridgeAddress] of otherChains) {
        const chainId = Number(chainIdStr);
        const domain = CHAIN_TO_DOMAIN[chainId];
        const bytes32Address = addressToBytes32(bridgeAddress);

        console.log(`\n${chainId} (Domain ${domain}):`);
        console.log(`  Bridge: ${bridgeAddress}`);
        console.log(`  Bytes32: ${bytes32Address}`);

        // Set as destination
        console.log("  Setting as destination contract...");
        const destTx = await bridge.setDestinationContract(domain, bytes32Address);
        await destTx.wait();
        console.log(`  TX: ${destTx.hash}`);

        // Set as authorized source
        console.log("  Setting as authorized source...");
        const sourceTx = await bridge.setAuthorizedSource(domain, bytes32Address);
        await sourceTx.wait();
        console.log(`  TX: ${sourceTx.hash}`);
    }

    // Verify registrations
    console.log("\n" + "=".repeat(60));
    console.log("VERIFICATION");
    console.log("=".repeat(60));

    for (const [chainIdStr, bridgeAddress] of otherChains) {
        const chainId = Number(chainIdStr);
        const domain = CHAIN_TO_DOMAIN[chainId];

        const destContract = await bridge.getDestinationContract(domain);
        const authSource = await bridge.getAuthorizedSource(domain);

        console.log(`\nDomain ${domain} (Chain ${chainId}):`);
        console.log(`  Destination Contract: ${destContract}`);
        console.log(`  Authorized Source:    ${authSource}`);
        console.log(`  Expected:             ${addressToBytes32(bridgeAddress)}`);
        console.log(`  Match: ${destContract === addressToBytes32(bridgeAddress) ? "YES" : "NO"}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("CROSS-REGISTRATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`\nNext steps:`);
    console.log(`1. Run this script on the other two chains`);
    console.log(`2. Test a cross-chain transfer`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
