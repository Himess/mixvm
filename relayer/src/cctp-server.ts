/**
 * CCTP Relayer Server
 *
 * Combined server for:
 * - Multi-chain CCTP event listening
 * - Attestation polling and relay
 * - Status API endpoints
 */

import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { CCTPListener } from "./cctp-listener";
import { createLogger } from "./logger";

dotenv.config();

const logger = createLogger("cctp-server");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// CCTP Listener instance
const listener = new CCTPListener();

// ============ Routes ============

// Health check
app.get("/health", (req: Request, res: Response) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        cctp: listener.getStatus(),
    });
});

// CCTP Listener status
app.get("/cctp/status", (req: Request, res: Response) => {
    res.json(listener.getStatus());
});

// Pending transfers
app.get("/cctp/pending", (req: Request, res: Response) => {
    res.json({
        count: listener.getPendingTransfers().length,
        transfers: listener.getPendingTransfers(),
    });
});

// Start listener manually
app.post("/cctp/start", (req: Request, res: Response) => {
    try {
        listener.start();
        res.json({ success: true, message: "CCTP listener started" });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Stop listener
app.post("/cctp/stop", (req: Request, res: Response) => {
    try {
        listener.stop();
        res.json({ success: true, message: "CCTP listener stopped" });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Chain info
app.get("/chains", (req: Request, res: Response) => {
    res.json({
        supported: [
            { chainId: 5042002, name: "Arc Testnet", domain: 26 },
            { chainId: 84532, name: "Base Sepolia", domain: 6 },
            { chainId: 11155111, name: "Ethereum Sepolia", domain: 0 },
        ],
        routes: [
            { from: "Arc", to: "Base", domain: "26 -> 6" },
            { from: "Arc", to: "Sepolia", domain: "26 -> 0" },
            { from: "Base", to: "Arc", domain: "6 -> 26" },
            { from: "Base", to: "Sepolia", domain: "6 -> 0" },
            { from: "Sepolia", to: "Arc", domain: "0 -> 26" },
            { from: "Sepolia", to: "Base", domain: "0 -> 6" },
        ],
    });
});

// ============ Server Start ============

async function startServer() {
    const PORT = parseInt(process.env.CCTP_PORT || "3001", 10);
    const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

    if (!PRIVATE_KEY) {
        logger.error("RELAYER_PRIVATE_KEY not set");
        process.exit(1);
    }

    // Set relayer wallet
    listener.setRelayerWallet(PRIVATE_KEY);

    // Auto-start listener if enabled
    if (process.env.AUTO_START_LISTENER !== "false") {
        logger.info("Auto-starting CCTP listener...");
        listener.start();
    }

    // Start server
    app.listen(PORT, () => {
        logger.info(`CCTP Relayer server running on port ${PORT}`);
        logger.info(`Health check: http://localhost:${PORT}/health`);
        logger.info(`CCTP status: http://localhost:${PORT}/cctp/status`);
    });
}

// Handle shutdown
process.on("SIGINT", () => {
    logger.info("Shutting down...");
    listener.stop();
    process.exit(0);
});

process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    listener.stop();
    process.exit(0);
});

startServer();

export { app, listener };
