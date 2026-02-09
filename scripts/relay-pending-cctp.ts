import { ethers } from "hardhat";

/**
 * Re-relay pending CCTP transfers that went to wrong MessageTransmitter address.
 *
 * Scans Base Sepolia bridge for CrossChainTransferInitiated events targeting Arb Sepolia,
 * fetches attestations from Circle Iris API, and relays them on the correct MessageTransmitterV2.
 *
 * Usage:
 *   npx hardhat run scripts/relay-pending-cctp.ts --network arbitrumSepolia
 */

const BASE_BRIDGE = "0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1";
const BASE_RPC = "https://sepolia.base.org";
const BASE_DEPLOY_BLOCK = 37366200;
const BASE_CCTP_DOMAIN = 6;

// Correct CCTP V2 MessageTransmitterV2 (same on all testnets)
const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

const BRIDGE_ABI = [
    "event CrossChainTransferInitiated(uint32 indexed dstEid, bytes32 indexed recipientCommitment, uint256 amount, bytes32 nullifier, bytes32 newSenderCommitment, uint256 senderLeafIndex, bytes32 guid)",
];

const MESSAGE_TRANSMITTER_ABI = [
    "function receiveMessage(bytes message, bytes attestation) external returns (bool success)",
    "function usedNonces(bytes32) view returns (uint256)",
];

const CIRCLE_IRIS_API = "https://iris-api-sandbox.circle.com/v2/messages";

// LZ EID for Arb Sepolia
const ARB_LZ_EID = 40231;

async function main() {
    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to chain ${network.chainId} as ${signer.address}`);

    if (Number(network.chainId) !== 421614) {
        throw new Error("This script must be run on --network arbitrumSepolia");
    }

    // Connect to Base Sepolia to read events
    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);
    const baseBridge = new ethers.Contract(BASE_BRIDGE, BRIDGE_ABI, baseProvider);

    // Scan for CrossChainTransferInitiated events targeting Arb Sepolia
    console.log("\n1. Scanning Base Sepolia bridge for cross-chain transfers to Arb...");
    const latestBlock = await baseProvider.getBlockNumber();

    // Scan in chunks to avoid RPC limits
    const events = [];
    const CHUNK_SIZE = 10000;
    for (let from = BASE_DEPLOY_BLOCK; from <= latestBlock; from += CHUNK_SIZE) {
        const to = Math.min(from + CHUNK_SIZE - 1, latestBlock);
        const filter = baseBridge.filters.CrossChainTransferInitiated(ARB_LZ_EID);
        const chunk = await baseBridge.queryFilter(filter, from, to);
        events.push(...chunk);
    }

    console.log(`   Found ${events.length} cross-chain transfer(s) to Arb Sepolia`);

    if (events.length === 0) {
        console.log("No transfers found. Exiting.");
        return;
    }

    // For each event, get the source TX hash and check CCTP attestation
    const messageTransmitter = new ethers.Contract(
        MESSAGE_TRANSMITTER_V2,
        MESSAGE_TRANSMITTER_ABI,
        signer
    );

    let relayedCount = 0;

    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const txHash = event.transactionHash;
        const amount = (event as ethers.EventLog).args[2];

        console.log(`\n--- Transfer ${i + 1}/${events.length} ---`);
        console.log(`   TX: ${txHash}`);
        console.log(`   Amount: ${ethers.formatUnits(amount, 6)} USDC`);

        // Query Circle Iris API
        const irisUrl = `${CIRCLE_IRIS_API}/${BASE_CCTP_DOMAIN}?transactionHash=${txHash}`;
        console.log(`   Querying Iris API...`);

        try {
            const resp = await fetch(irisUrl);
            if (!resp.ok) {
                console.log(`   Iris API returned ${resp.status} - skipping`);
                continue;
            }

            const data = await resp.json();
            if (!data.messages || data.messages.length === 0) {
                console.log(`   No CCTP message found for this TX - skipping`);
                continue;
            }

            const msg = data.messages[0];
            console.log(`   CCTP status: ${msg.status}`);

            if (msg.status !== "complete") {
                console.log(`   Attestation not ready - skipping`);
                continue;
            }

            // Check if nonce is already used on the real MessageTransmitter
            // CCTP V2 uses source domain + nonce as the key
            // For now, just try to relay - if nonce is used, it will revert
            console.log(`   Relaying to correct MessageTransmitterV2...`);

            try {
                // Get fee data for proper gas pricing on Arb
                const feeData = await ethers.provider.getFeeData();
                const gasOverrides: Record<string, unknown> = { gasLimit: 500000 };
                if (feeData.maxFeePerGas) {
                    gasOverrides.maxFeePerGas = feeData.maxFeePerGas * 2n;
                    gasOverrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
                        ? feeData.maxPriorityFeePerGas * 2n
                        : 1000000n;
                }

                const relayTx = await messageTransmitter.receiveMessage(
                    msg.message,
                    msg.attestation,
                    gasOverrides
                );
                console.log(`   Relay TX: ${relayTx.hash}`);

                const receipt = await relayTx.wait();
                console.log(`   Confirmed! Gas used: ${receipt?.gasUsed}`);
                console.log(`   Logs: ${receipt?.logs?.length || 0}`);
                relayedCount++;

                // Small delay between relays
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (relayErr: unknown) {
                const errMsg = relayErr instanceof Error ? relayErr.message : String(relayErr);
                if (errMsg.includes("Nonce already used") || errMsg.includes("already received")) {
                    console.log(`   Already relayed (nonce consumed) - skipping`);
                } else {
                    console.error(`   Relay failed:`, errMsg.slice(0, 200));
                }
            }
        } catch (fetchErr) {
            console.error(`   Iris API error:`, fetchErr);
        }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Relayed ${relayedCount}/${events.length} pending CCTP transfers`);
    console.log(`${"=".repeat(60)}`);

    // Check bridge USDC balance
    const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
    const arbBridge = "0x976f28253965A5bA21ad8ada897CC8383cdF206F";
    const arbUsdc = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
    const usdc = new ethers.Contract(arbUsdc, usdcAbi, ethers.provider);
    const balance = await usdc.balanceOf(arbBridge);
    console.log(`\nArb Bridge USDC balance: ${ethers.formatUnits(balance, 6)} USDC`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
