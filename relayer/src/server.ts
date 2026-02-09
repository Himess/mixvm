import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { ethers } from "ethers";

import { RelayRequest, RelayResponse, RelayerConfig } from "./types";
import { validateRelayRequest } from "./validator";
import { TxSubmitter } from "./submitter";
import { createLogger } from "./logger";

// Load environment variables
dotenv.config();

const logger = createLogger("server");

// ============ Configuration ============

function loadConfig(): RelayerConfig {
  const requiredEnvVars = [
    "ARC_RPC_URL",
    "RELAYER_PRIVATE_KEY",
    "PRIVATE_USDC_ADDRESS",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    port: parseInt(process.env.PORT || "3000", 10),
    rpcUrl: process.env.ARC_RPC_URL!,
    chainId: parseInt(process.env.ARC_CHAIN_ID || "5042002", 10),
    contractAddress: process.env.PRIVATE_USDC_ADDRESS!,
    privateKey: process.env.RELAYER_PRIVATE_KEY!,
    maxGasPrice: BigInt(process.env.MAX_GAS_PRICE || "100000000000"), // 100 gwei default
    feeRateBps: parseInt(process.env.FEE_RATE_BPS || "10", 10), // 0.1% default
  };
}

// ============ Express App Setup ============

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: "REL004: Rate limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request completed", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// ============ Routes ============

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Relayer info
app.get("/info", async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const submitter = new TxSubmitter(config);
    const balance = await submitter.getBalance();

    res.json({
      address: submitter.getAddress(),
      balance: ethers.formatEther(balance),
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      feeRateBps: config.feeRateBps,
    });
  } catch (error) {
    logger.error("Info endpoint error", { error: String(error) });
    res.status(500).json({ error: "Failed to get relayer info" });
  }
});

// Main relay endpoint
app.post("/api/v1/relay", async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);
  logger.info("Relay request received", { requestId, type: req.body?.type });

  try {
    // Validate request format
    const validation = validateRelayRequest(req.body);
    if (!validation.valid) {
      logger.warn("Invalid relay request", {
        requestId,
        error: validation.error,
      });
      return res.status(400).json({
        success: false,
        error: `REL001: ${validation.error}`,
      } as RelayResponse);
    }

    const relayRequest = req.body as RelayRequest;

    // Load config and create submitter
    const config = loadConfig();
    const submitter = new TxSubmitter(config);

    // Check relayer balance
    const balance = await submitter.getBalance();
    if (balance < ethers.parseEther("0.01")) {
      logger.error("Relayer balance too low", { balance: balance.toString() });
      return res.status(503).json({
        success: false,
        error: "REL005: Relayer temporarily unavailable",
      } as RelayResponse);
    }

    // Submit transaction based on type
    let result;
    if (relayRequest.type === "transfer") {
      result = await submitter.submitTransfer(relayRequest);
    } else {
      result = await submitter.submitWithdraw(relayRequest);
    }

    // Check result
    if (result.status === "failed") {
      logger.error("Relay TX failed", { requestId, error: result.error });
      return res.status(400).json({
        success: false,
        error: `REL003: ${result.error}`,
      } as RelayResponse);
    }

    logger.info("Relay successful", {
      requestId,
      txHash: result.hash,
      blockNumber: result.blockNumber,
    });

    return res.json({
      success: true,
      txHash: result.hash,
      blockNumber: result.blockNumber,
    } as RelayResponse);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Relay endpoint error", { requestId, error: errorMsg });
    return res.status(500).json({
      success: false,
      error: "REL003: TX submission failed",
    } as RelayResponse);
  }
});

// ============ Error Handling ============

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

// ============ Server Start ============

async function startServer() {
  try {
    const config = loadConfig();

    // Verify configuration
    logger.info("Starting relayer server...");
    logger.info("Configuration loaded", {
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      feeRateBps: config.feeRateBps,
    });

    // Initialize submitter and check balance
    const submitter = new TxSubmitter(config);
    const balance = await submitter.getBalance();
    logger.info("Relayer wallet", {
      address: submitter.getAddress(),
      balance: ethers.formatEther(balance),
    });

    if (balance < ethers.parseEther("0.01")) {
      logger.warn("Low relayer balance! Consider funding the wallet.");
    }

    // Start server
    app.listen(config.port, () => {
      logger.info(`Relayer server running on port ${config.port}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
      logger.info(`Relay endpoint: http://localhost:${config.port}/api/v1/relay`);
    });
  } catch (error) {
    logger.error("Failed to start server", { error: String(error) });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

// Start if main module
startServer();

export { app };
