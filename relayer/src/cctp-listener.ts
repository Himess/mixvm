/**
 * Multi-chain CCTP Event Listener
 *
 * Listens for CrossChainTransferInitiated events on all supported chains
 * and relays messages with Circle attestations to destination chains.
 */

import { ethers } from "ethers";
import { createLogger } from "./logger";

const logger = createLogger("cctp-listener");

// Chain configurations
interface ChainConfig {
    chainId: number;
    name: string;
    domain: number;
    rpc: string;
    bridge: string;
    messageTransmitter: string;
}

const CHAIN_CONFIGS: ChainConfig[] = [
    {
        chainId: 5042002,
        name: "Arc Testnet",
        domain: 26,
        rpc: process.env.ARC_RPC_URL || "https://arc-testnet.drpc.org",
        bridge: process.env.ARC_BRIDGE_ADDRESS || "0x75d0eeEE3288D875Dd60A0066437ed12445b0C03",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    },
    {
        chainId: 84532,
        name: "Base Sepolia",
        domain: 6,
        rpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
        bridge: process.env.BASE_BRIDGE_ADDRESS || "0xDF93773761102e0cbc6b90Fa04699e7f26Ac28c9",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    },
    {
        chainId: 11155111,
        name: "Ethereum Sepolia",
        domain: 0,
        rpc: process.env.ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        bridge: process.env.ETH_BRIDGE_ADDRESS || "0x394222B73b295374b951B79d5f6796b463392f87",
        messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    },
    {
        chainId: 43113,
        name: "Avalanche Fuji",
        domain: 1,
        rpc: process.env.AVAX_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
        bridge: process.env.AVAX_BRIDGE_ADDRESS || "", // TODO: Deploy bridge
        messageTransmitter: "0xa9fB1b3009DCb79E2fe346c16a604B8Fa8aE0a79",
    },
];

// ABIs - Updated for v11 contract
const BRIDGE_ABI = [
    "event CrossChainTransferInitiated(uint64 indexed burnNonce, uint64 indexed metadataNonce, uint32 indexed destinationDomain, bytes32 recipientCommitment, uint256 amount, bytes32 nullifier, bytes32 newSenderCommitment, uint256 senderLeafIndex)",
    "event CrossChainMetadataEmitted(uint64 indexed burnNonce, uint32 indexed destinationDomain, bytes32 destinationContract, bytes32 recipientCommitment, uint256 amount, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData)",
    "event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)",
];

const MESSAGE_TRANSMITTER_ABI = [
    "event MessageSent(bytes message)",
    "function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool success)",
    "function localDomain() view returns (uint32)",
    "function version() view returns (uint32)",
];

// Circle Attestation API - Production endpoint for testnets too
const CIRCLE_ATTESTATION_API = "https://iris-api.circle.com/attestations";

interface PendingTransfer {
    sourceChain: ChainConfig;
    destChain: ChainConfig;
    nonce: bigint;
    messageHash: string;
    message: string;
    timestamp: number;
    retries: number;
}

export class CCTPListener {
    private providers: Map<number, ethers.JsonRpcProvider> = new Map();
    private bridges: Map<number, ethers.Contract> = new Map();
    private transmitters: Map<number, ethers.Contract> = new Map();
    private pendingTransfers: Map<string, PendingTransfer> = new Map();
    private relayerWallet: ethers.Wallet | null = null;
    private isRunning = false;
    private lastProcessedBlock: Map<number, number> = new Map();
    private readonly POLL_INTERVAL = 10000; // 10 seconds
    private readonly BLOCK_LOOKBACK = 100; // Look back 100 blocks on startup

    constructor() {
        this.initializeProviders();
    }

    private initializeProviders() {
        for (const config of CHAIN_CONFIGS) {
            if (!config.bridge) {
                logger.warn(`Bridge address not set for ${config.name}`);
                continue;
            }

            const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId);
            this.providers.set(config.chainId, provider);

            const bridge = new ethers.Contract(config.bridge, BRIDGE_ABI, provider);
            this.bridges.set(config.chainId, bridge);

            const transmitter = new ethers.Contract(
                config.messageTransmitter,
                MESSAGE_TRANSMITTER_ABI,
                provider
            );
            this.transmitters.set(config.chainId, transmitter);

            logger.info(`Initialized provider for ${config.name}`);
        }
    }

    public setRelayerWallet(privateKey: string) {
        this.relayerWallet = new ethers.Wallet(privateKey);
        logger.info(`Relayer wallet set: ${this.relayerWallet.address}`);
    }

    public async start() {
        if (this.isRunning) {
            logger.warn("Listener already running");
            return;
        }

        this.isRunning = true;
        logger.info("Starting CCTP listener with polling...");

        // Initialize last processed blocks
        for (const config of CHAIN_CONFIGS) {
            if (!config.bridge) continue;
            // Skip Arc for now - drpc.org free tier doesn't support filtering
            if (config.chainId === 5042002) {
                logger.warn(`Skipping ${config.name} - RPC doesn't support event filtering on free tier`);
                continue;
            }

            const provider = this.providers.get(config.chainId);
            if (!provider) continue;

            try {
                const currentBlock = await provider.getBlockNumber();
                const startBlock = Math.max(0, currentBlock - this.BLOCK_LOOKBACK);
                this.lastProcessedBlock.set(config.chainId, startBlock);
                logger.info(`Initialized ${config.name} from block ${startBlock} (current: ${currentBlock})`);
            } catch (error) {
                logger.error(`Failed to get block number for ${config.name}`, { error: String(error) });
            }
        }

        // Start event polling loop
        this.startEventPolling();

        // Start attestation polling loop
        this.startAttestationPolling();
    }

    private async startEventPolling() {
        while (this.isRunning) {
            for (const config of CHAIN_CONFIGS) {
                if (!config.bridge) continue;
                // Skip Arc
                if (config.chainId === 5042002) continue;

                const lastBlock = this.lastProcessedBlock.get(config.chainId);
                if (lastBlock === undefined) continue;

                try {
                    await this.pollChainEvents(config, lastBlock);
                } catch (error) {
                    logger.error(`Error polling ${config.name}`, { error: String(error) });
                }
            }
            await this.sleep(this.POLL_INTERVAL);
        }
    }

    private async pollChainEvents(config: ChainConfig, fromBlock: number) {
        const provider = this.providers.get(config.chainId);
        const bridge = this.bridges.get(config.chainId);
        if (!provider || !bridge) return;

        try {
            const currentBlock = await provider.getBlockNumber();
            if (currentBlock <= fromBlock) return;

            // Query for CrossChainTransferInitiated events
            const filter = bridge.filters.CrossChainTransferInitiated();
            const events = await bridge.queryFilter(filter, fromBlock + 1, currentBlock);

            if (events.length > 0) {
                logger.info(`Found ${events.length} CrossChainTransferInitiated events on ${config.name}`);
            }

            for (const event of events) {
                if (event instanceof ethers.EventLog) {
                    const [burnNonce, metadataNonce, destDomain, commitment, amount, nullifier] = event.args;
                    await this.handleTransferInitiated(
                        config,
                        burnNonce,
                        destDomain,
                        commitment,
                        amount,
                        nullifier,
                        event
                    );
                }
            }

            // Update last processed block
            this.lastProcessedBlock.set(config.chainId, currentBlock);
        } catch (error) {
            logger.error(`Failed to poll events for ${config.name}`, { error: String(error) });
        }
    }

    public stop() {
        this.isRunning = false;
        logger.info("CCTP listener stopped");
    }

    private async handleTransferInitiated(
        sourceConfig: ChainConfig,
        nonce: bigint,
        destDomain: number,
        commitment: string,
        amount: bigint,
        nullifier: string,
        event: ethers.EventLog
    ) {
        logger.info("CrossChainTransferInitiated detected", {
            source: sourceConfig.name,
            sourceDomain: sourceConfig.domain,
            destDomain,
            nonce: nonce.toString(),
            amount: amount.toString(),
            txHash: event.transactionHash,
        });

        // Find destination chain
        const destConfig = CHAIN_CONFIGS.find((c) => c.domain === destDomain);
        if (!destConfig) {
            logger.error(`Unknown destination domain: ${destDomain}`);
            return;
        }

        // Get the MessageSent event from the same transaction
        try {
            const receipt = await event.getTransactionReceipt();
            if (!receipt) {
                logger.error("Could not get transaction receipt");
                return;
            }

            // Find MessageSent event
            const transmitter = this.transmitters.get(sourceConfig.chainId);
            if (!transmitter) {
                logger.error("Transmitter not found for source chain");
                return;
            }

            const messageSentTopic = ethers.id("MessageSent(bytes)");
            const messageSentLog = receipt.logs.find((log) => log.topics[0] === messageSentTopic);

            if (!messageSentLog) {
                logger.error("MessageSent event not found in transaction");
                return;
            }

            // Decode message
            const iface = new ethers.Interface(MESSAGE_TRANSMITTER_ABI);
            const decoded = iface.decodeEventLog("MessageSent", messageSentLog.data, messageSentLog.topics);
            const message = decoded.message;

            // Calculate message hash
            const messageHash = ethers.keccak256(message);

            // Store pending transfer
            const transferKey = `${sourceConfig.domain}-${nonce.toString()}`;
            this.pendingTransfers.set(transferKey, {
                sourceChain: sourceConfig,
                destChain: destConfig,
                nonce,
                messageHash,
                message,
                timestamp: Date.now(),
                retries: 0,
            });

            logger.info("Transfer queued for attestation", {
                transferKey,
                messageHash,
                destChain: destConfig.name,
            });
        } catch (error) {
            logger.error("Error processing transfer event", { error: String(error) });
        }
    }

    private async startAttestationPolling() {
        const POLL_INTERVAL = 15000; // 15 seconds
        const MAX_RETRIES = 60; // 15 minutes max wait

        while (this.isRunning) {
            for (const [key, transfer] of this.pendingTransfers.entries()) {
                try {
                    // Check if max retries exceeded
                    if (transfer.retries >= MAX_RETRIES) {
                        logger.error("Max retries exceeded for transfer", { key });
                        this.pendingTransfers.delete(key);
                        continue;
                    }

                    // Try to get attestation
                    const attestation = await this.getAttestation(transfer.messageHash);

                    if (attestation) {
                        logger.info("Attestation received", { key, messageHash: transfer.messageHash });

                        // Relay message to destination
                        await this.relayMessage(transfer, attestation);
                        this.pendingTransfers.delete(key);
                    } else {
                        transfer.retries++;
                        logger.debug("Attestation not ready", {
                            key,
                            retries: transfer.retries,
                            maxRetries: MAX_RETRIES,
                        });
                    }
                } catch (error) {
                    logger.error("Error polling attestation", { key, error: String(error) });
                    transfer.retries++;
                }
            }

            await this.sleep(POLL_INTERVAL);
        }
    }

    private async getAttestation(messageHash: string): Promise<string | null> {
        try {
            const response = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
            const data = await response.json() as { status: string; attestation?: string };

            if (data.status === "complete" && data.attestation) {
                return data.attestation;
            }

            return null;
        } catch (error) {
            logger.debug("Attestation fetch failed", { messageHash, error: String(error) });
            return null;
        }
    }

    private async relayMessage(transfer: PendingTransfer, attestation: string) {
        if (!this.relayerWallet) {
            logger.error("Relayer wallet not set");
            return;
        }

        const destProvider = this.providers.get(transfer.destChain.chainId);
        if (!destProvider) {
            logger.error("Destination provider not found");
            return;
        }

        const signer = this.relayerWallet.connect(destProvider);

        const transmitter = new ethers.Contract(
            transfer.destChain.messageTransmitter,
            MESSAGE_TRANSMITTER_ABI,
            signer
        );

        logger.info("Relaying message to destination", {
            destChain: transfer.destChain.name,
            messageHash: transfer.messageHash,
        });

        try {
            const tx = await transmitter.receiveMessage(transfer.message, attestation, {
                gasLimit: 500000,
            });

            logger.info("Relay TX sent", { txHash: tx.hash });

            const receipt = await tx.wait();
            logger.info("Relay TX confirmed", {
                txHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
            });
        } catch (error) {
            logger.error("Relay failed", { error: String(error) });
            throw error;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // API methods for status
    public getStatus() {
        return {
            isRunning: this.isRunning,
            pendingTransfers: this.pendingTransfers.size,
            chains: CHAIN_CONFIGS.filter((c) => c.bridge).map((c) => ({
                name: c.name,
                chainId: c.chainId,
                domain: c.domain,
                bridge: c.bridge,
            })),
        };
    }

    public getPendingTransfers() {
        return Array.from(this.pendingTransfers.entries()).map(([key, transfer]) => ({
            key,
            source: transfer.sourceChain.name,
            destination: transfer.destChain.name,
            nonce: transfer.nonce.toString(),
            messageHash: transfer.messageHash,
            timestamp: transfer.timestamp,
            retries: transfer.retries,
        }));
    }
}

// Export singleton instance
export const cctpListener = new CCTPListener();

// Start listener if running as main module
if (require.main === module) {
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error("RELAYER_PRIVATE_KEY not set");
        process.exit(1);
    }

    cctpListener.setRelayerWallet(privateKey);
    cctpListener.start();

    // Keep process running
    process.on("SIGINT", () => {
        console.log("Shutting down...");
        cctpListener.stop();
        process.exit(0);
    });
}
