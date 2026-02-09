/**
 * Relay request types
 */
export type RelayType = "transfer" | "withdraw";

/**
 * Proof data structure (matches Groth16)
 */
export interface ProofData {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  publicSignals: string[];
}

/**
 * Stealth data for private transfers
 */
export interface StealthData {
  ephemeralPubKeyX: string;
  ephemeralPubKeyY: string;
  stealthAddressX: string;
  stealthAddressY: string;
  viewTag: string;
}

/**
 * Audit data for compliance
 */
export interface AuditData {
  encryptedSender: [string, string, string, string];
  encryptedRecipient: [string, string, string, string];
  encryptedAmount: [string, string, string, string];
}

/**
 * Transfer relay request
 */
export interface TransferRelayRequest {
  type: "transfer";
  nullifier: string;
  newSenderCommitment: string;
  recipientCommitment: string;
  stealthData: StealthData;
  auditData: AuditData;
  proof: ProofData;
}

/**
 * Withdraw relay request
 */
export interface WithdrawRelayRequest {
  type: "withdraw";
  amount: string;
  nullifier: string;
  newCommitment: string;
  recipient: string;
  proof: ProofData;
}

/**
 * Combined relay request
 */
export type RelayRequest = TransferRelayRequest | WithdrawRelayRequest;

/**
 * Relay response
 */
export interface RelayResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

/**
 * Relayer configuration
 */
export interface RelayerConfig {
  port: number;
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  privateKey: string;
  maxGasPrice: bigint;
  feeRateBps: number; // basis points (100 = 1%)
}

/**
 * Transaction status
 */
export interface TxStatus {
  hash: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  gasUsed?: bigint;
  error?: string;
}
