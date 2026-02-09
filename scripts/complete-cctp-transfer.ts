import { ethers } from "hardhat";

/**
 * Complete a CCTP cross-chain transfer by calling receiveMessage
 *
 * This script:
 * 1. Checks attestation status from Circle
 * 2. When ready, calls receiveMessage on destination MessageTransmitter
 * 3. USDC is minted to the bridge contract (NOT to user - privacy preserved!)
 *
 * Usage:
 *   npx hardhat run scripts/complete-cctp-transfer.ts --network ethereumSepolia
 */

// Circle Attestation API (Sandbox/Testnet)
const CIRCLE_ATTESTATION_API = "https://iris-api-sandbox.circle.com/attestations";

// MessageTransmitter addresses
const MESSAGE_TRANSMITTERS: Record<number, string> = {
    11155111: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", // Ethereum Sepolia
    84532: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",    // Base Sepolia
    421614: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",   // Arbitrum Sepolia
};

const MESSAGE_TRANSMITTER_ABI = [
    "function receiveMessage(bytes message, bytes attestation) external returns (bool success)",
    "function usedNonces(bytes32) view returns (uint256)",
];

interface AttestationResponse {
    attestation: string;
    status: string;
}

async function getAttestation(messageHash: string): Promise<AttestationResponse> {
    const response = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
    return response.json();
}

async function waitForAttestation(messageHash: string, maxWaitMs: number = 900000): Promise<string> {
    console.log(`Waiting for attestation for message: ${messageHash}`);
    console.log(`Max wait time: ${maxWaitMs / 1000} seconds`);

    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < maxWaitMs) {
        attempts++;
        const result = await getAttestation(messageHash);

        console.log(`[Attempt ${attempts}] Status: ${result.status}`);

        if (result.status === "complete") {
            console.log("✅ Attestation ready!");
            return result.attestation;
        }

        // Wait 10 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    throw new Error(`Attestation not ready after ${maxWaitMs / 1000} seconds`);
}

async function main() {
    // Get these from command line or hardcode for testing
    const MESSAGE_HASH = process.env.MESSAGE_HASH || "0xd3617c3a8df8f6e76b9ea20b35f91edba59272cda276f66b93fb8762d6d5a634";
    const MESSAGE_BYTES = process.env.MESSAGE_BYTES || "";

    console.log("=".repeat(60));
    console.log("CCTP Transfer Completion Script");
    console.log("=".repeat(60));

    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("\nNetwork:", chainId);
    console.log("Signer:", signer.address);

    const messageTransmitterAddress = MESSAGE_TRANSMITTERS[chainId];
    if (!messageTransmitterAddress) {
        throw new Error(`No MessageTransmitter for chain ${chainId}`);
    }

    console.log("MessageTransmitter:", messageTransmitterAddress);
    console.log("Message Hash:", MESSAGE_HASH);

    // Step 1: Wait for attestation
    console.log("\n1. Checking attestation status...");
    const attestation = await waitForAttestation(MESSAGE_HASH);
    console.log("Attestation:", attestation.slice(0, 50) + "...");

    // Step 2: Call receiveMessage
    if (!MESSAGE_BYTES) {
        console.log("\n⚠️  MESSAGE_BYTES not provided!");
        console.log("You need to get the message bytes from the source chain transaction logs.");
        console.log("Look for MessageSent event and extract the 'message' parameter.");
        return;
    }

    console.log("\n2. Calling receiveMessage...");
    const messageTransmitter = new ethers.Contract(
        messageTransmitterAddress,
        MESSAGE_TRANSMITTER_ABI,
        signer
    );

    const tx = await messageTransmitter.receiveMessage(MESSAGE_BYTES, attestation);
    console.log("TX sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("TX confirmed! Block:", receipt?.blockNumber);

    console.log("\n" + "=".repeat(60));
    console.log("✅ CCTP TRANSFER COMPLETE!");
    console.log("=".repeat(60));
    console.log("\nUSDC has been minted to the destination bridge contract.");
    console.log("The user's commitment is now in the merkle tree.");
    console.log("User can withdraw privately using ZK proof.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
