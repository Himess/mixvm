import { ProofData, TransferRelayRequest, WithdrawRelayRequest } from "./types";
import { ethers } from "ethers";

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate proof data format
 */
export function validateProofFormat(proof: ProofData): ValidationResult {
  try {
    // Check pA (2 elements)
    if (!Array.isArray(proof.pA) || proof.pA.length !== 2) {
      return { valid: false, error: "Invalid pA format" };
    }
    for (const p of proof.pA) {
      if (!isValidBigIntString(p)) {
        return { valid: false, error: "Invalid pA value" };
      }
    }

    // Check pB (2x2 matrix)
    if (!Array.isArray(proof.pB) || proof.pB.length !== 2) {
      return { valid: false, error: "Invalid pB format" };
    }
    for (const row of proof.pB) {
      if (!Array.isArray(row) || row.length !== 2) {
        return { valid: false, error: "Invalid pB row format" };
      }
      for (const p of row) {
        if (!isValidBigIntString(p)) {
          return { valid: false, error: "Invalid pB value" };
        }
      }
    }

    // Check pC (2 elements)
    if (!Array.isArray(proof.pC) || proof.pC.length !== 2) {
      return { valid: false, error: "Invalid pC format" };
    }
    for (const p of proof.pC) {
      if (!isValidBigIntString(p)) {
        return { valid: false, error: "Invalid pC value" };
      }
    }

    // Check publicSignals
    if (!Array.isArray(proof.publicSignals) || proof.publicSignals.length === 0) {
      return { valid: false, error: "Invalid publicSignals format" };
    }
    for (const s of proof.publicSignals) {
      if (!isValidBigIntString(s)) {
        return { valid: false, error: "Invalid publicSignals value" };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: "Proof validation error: " + String(error) };
  }
}

/**
 * Validate transfer relay request
 */
export function validateTransferRequest(req: TransferRelayRequest): ValidationResult {
  try {
    // Validate nullifier (bytes32)
    if (!isValidBytes32(req.nullifier)) {
      return { valid: false, error: "Invalid nullifier format" };
    }

    // Validate newSenderCommitment (bytes32)
    if (!isValidBytes32(req.newSenderCommitment)) {
      return { valid: false, error: "Invalid newSenderCommitment format" };
    }

    // Validate recipientCommitment (bytes32)
    if (!isValidBytes32(req.recipientCommitment)) {
      return { valid: false, error: "Invalid recipientCommitment format" };
    }

    // Validate stealthData
    if (!req.stealthData) {
      return { valid: false, error: "Missing stealthData" };
    }
    if (!isValidBigIntString(req.stealthData.ephemeralPubKeyX)) {
      return { valid: false, error: "Invalid ephemeralPubKeyX" };
    }
    if (!isValidBigIntString(req.stealthData.ephemeralPubKeyY)) {
      return { valid: false, error: "Invalid ephemeralPubKeyY" };
    }
    if (!isValidBigIntString(req.stealthData.stealthAddressX)) {
      return { valid: false, error: "Invalid stealthAddressX" };
    }
    if (!isValidBigIntString(req.stealthData.stealthAddressY)) {
      return { valid: false, error: "Invalid stealthAddressY" };
    }
    if (!isValidBigIntString(req.stealthData.viewTag)) {
      return { valid: false, error: "Invalid viewTag" };
    }

    // Validate auditData
    if (!req.auditData) {
      return { valid: false, error: "Missing auditData" };
    }
    if (!isValidEncryptedArray(req.auditData.encryptedSender)) {
      return { valid: false, error: "Invalid encryptedSender" };
    }
    if (!isValidEncryptedArray(req.auditData.encryptedRecipient)) {
      return { valid: false, error: "Invalid encryptedRecipient" };
    }
    if (!isValidEncryptedArray(req.auditData.encryptedAmount)) {
      return { valid: false, error: "Invalid encryptedAmount" };
    }

    // Validate proof format
    const proofValidation = validateProofFormat(req.proof);
    if (!proofValidation.valid) {
      return proofValidation;
    }

    // Check public signals count (transfer has 4 signals)
    if (req.proof.publicSignals.length !== 4) {
      return { valid: false, error: "Transfer proof must have 4 public signals" };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: "Transfer validation error: " + String(error) };
  }
}

/**
 * Validate withdraw relay request
 */
export function validateWithdrawRequest(req: WithdrawRelayRequest): ValidationResult {
  try {
    // Validate amount
    if (!isValidBigIntString(req.amount)) {
      return { valid: false, error: "Invalid amount" };
    }
    const amount = BigInt(req.amount);
    if (amount <= 0n) {
      return { valid: false, error: "Amount must be positive" };
    }

    // Validate nullifier (bytes32)
    if (!isValidBytes32(req.nullifier)) {
      return { valid: false, error: "Invalid nullifier format" };
    }

    // Validate newCommitment (bytes32 or zero)
    if (req.newCommitment !== ethers.ZeroHash && !isValidBytes32(req.newCommitment)) {
      return { valid: false, error: "Invalid newCommitment format" };
    }

    // Validate recipient address
    if (!ethers.isAddress(req.recipient)) {
      return { valid: false, error: "Invalid recipient address" };
    }
    if (req.recipient === ethers.ZeroAddress) {
      return { valid: false, error: "Recipient cannot be zero address" };
    }

    // Validate proof format
    const proofValidation = validateProofFormat(req.proof);
    if (!proofValidation.valid) {
      return proofValidation;
    }

    // Check public signals count (withdraw has 5 signals)
    if (req.proof.publicSignals.length !== 5) {
      return { valid: false, error: "Withdraw proof must have 5 public signals" };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: "Withdraw validation error: " + String(error) };
  }
}

/**
 * Validate relay request
 */
export function validateRelayRequest(req: unknown): ValidationResult {
  if (!req || typeof req !== "object") {
    return { valid: false, error: "Invalid request format" };
  }

  const request = req as { type?: string };

  if (request.type === "transfer") {
    return validateTransferRequest(req as TransferRelayRequest);
  } else if (request.type === "withdraw") {
    return validateWithdrawRequest(req as WithdrawRelayRequest);
  } else {
    return { valid: false, error: "Invalid request type. Must be 'transfer' or 'withdraw'" };
  }
}

// ============ Helper functions ============

function isValidBigIntString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

function isValidBytes32(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isValidEncryptedArray(arr: unknown): boolean {
  if (!Array.isArray(arr) || arr.length !== 4) return false;
  return arr.every(isValidBigIntString);
}
