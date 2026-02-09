/**
 * CCTP Listener Startup Script
 */

import "dotenv/config";
import { cctpListener } from "./cctp-listener";

console.log("=== MixVM CCTP Relayer ===");
console.log("Starting listener...\n");

const privateKey = process.env.RELAYER_PRIVATE_KEY;
if (!privateKey) {
    console.error("ERROR: RELAYER_PRIVATE_KEY not set in .env");
    process.exit(1);
}

// Set relayer wallet
cctpListener.setRelayerWallet(privateKey);

// Start listening
cctpListener.start();

console.log("\nRelayer is running. Press Ctrl+C to stop.\n");

// Status updates every 30 seconds
setInterval(() => {
    const status = cctpListener.getStatus();
    const pending = cctpListener.getPendingTransfers();

    console.log(`[${new Date().toISOString()}] Status: ${status.isRunning ? "Running" : "Stopped"}, Pending: ${pending.length}`);

    if (pending.length > 0) {
        pending.forEach(p => {
            console.log(`  - ${p.source} → ${p.destination}: ${p.messageHash.slice(0, 16)}... (retries: ${p.retries})`);
        });
    }
}, 30000);

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\nShutting down...");
    cctpListener.stop();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    cctpListener.stop();
    process.exit(0);
});
