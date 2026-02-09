import { Provider, Signer } from "ethers";

/**
 * SDK Configuration
 */
export interface SDKConfig {
  provider: Provider;
  signer?: Signer;
  contractAddress: string;
  verifierAddress?: string;
  withdrawVerifierAddress?: string;
  poseidonAddress?: string;
  circuitPaths?: CircuitPaths;
}

/**
 * Circuit file paths
 */
export interface CircuitPaths {
  transferWasm: string;
  transferZkey: string;
  transferVkey: string;
  withdrawWasm: string;
  withdrawZkey: string;
  withdrawVkey: string;
}

/**
 * Private note containing commitment details
 */
export interface PrivateNote {
  commitment: bigint;
  balance: bigint;
  randomness: bigint;
  nullifierSecret: bigint;
  leafIndex: number;
}

/**
 * Merkle proof for a leaf
 */
export interface MerkleProof {
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
  leafIndex: number;
}

/**
 * ZK Proof data for contract calls
 */
export interface ProofData {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
  publicSignals: bigint[];
}

/**
 * Transfer proof inputs
 */
export interface TransferInputs {
  senderBalance: bigint;
  senderRandomness: bigint;
  senderNullifierSecret: bigint;
  transferAmount: bigint;
  newSenderRandomness: bigint;
  recipientRandomness: bigint;
  merklePathElements: bigint[];
  merklePathIndices: number[];
}

/**
 * Withdraw proof inputs
 */
export interface WithdrawInputs {
  balance: bigint;
  randomness: bigint;
  nullifierSecret: bigint;
  withdrawAmount: bigint;
  newRandomness: bigint;
  recipient: string;
  merklePathElements: bigint[];
  merklePathIndices: number[];
}

/**
 * Stealth meta-address (spending + viewing keys)
 */
export interface StealthMetaAddress {
  spendingPubKeyX: bigint;
  spendingPubKeyY: bigint;
  viewingPubKeyX: bigint;
  viewingPubKeyY: bigint;
}

/**
 * Stealth announcement event data
 */
export interface StealthAnnouncement {
  ephemeralPubKeyX: bigint;
  ephemeralPubKeyY: bigint;
  stealthAddressX: bigint;
  stealthAddressY: bigint;
  viewTag: bigint;
  commitment: string;
  timestamp: number;
  sender: string;
  blockNumber: number;
  announcementIndex: number;
}

/**
 * Incoming payment detected by scanner
 */
export interface IncomingPayment {
  commitment: string;
  sharedSecret: bigint;
  blockNumber: number;
  announcementIndex: number;
  stealthAddress: { x: bigint; y: bigint };
}

/**
 * User balance state
 */
export interface BalanceState {
  notes: PrivateNote[];
  totalBalance: bigint;
  pendingIncoming: IncomingPayment[];
}

/**
 * Transfer result
 */
export interface TransferResult {
  txHash: string;
  blockNumber: number;
  nullifier: string;
  newSenderCommitment: string;
  recipientCommitment: string;
  announcementIndex: number;
}

/**
 * Withdraw result
 */
export interface WithdrawResult {
  txHash: string;
  blockNumber: number;
  nullifier: string;
  amount: bigint;
  recipient: string;
  newCommitment?: string;
}

/**
 * Deposit result
 */
export interface DepositResult {
  txHash: string;
  blockNumber: number;
  commitment: string;
  leafIndex: number;
  note: PrivateNote;
}

/**
 * Field size for BN254 curve
 */
export const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

/**
 * Merkle tree depth (must match circuit)
 */
export const MERKLE_DEPTH = 10;

/**
 * Cross-chain transfer result
 */
export interface CrossChainTransferResult {
  txHash: string;
  blockNumber: number;
  cctpNonce: bigint;
  nullifier: string;
  newSenderCommitment?: string;
  recipientCommitment: string;
  destinationDomain: number;
}

/**
 * Multi-chain SDK configuration
 */
export interface MultiChainConfig {
  arcTestnet: ChainConfig;
  baseSepolia?: ChainConfig;
  ethereumSepolia?: ChainConfig;
}

/**
 * Single chain configuration
 */
export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  cctpSourceAddress?: string;
  cctpDestinationAddress?: string;
}

/**
 * CCTP domain IDs
 */
export const CCTP_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
} as const;

/**
 * Stealth data for transfers
 */
export interface StealthData {
  ephemeralPubKeyX: bigint;
  ephemeralPubKeyY: bigint;
  stealthAddressX: bigint;
  stealthAddressY: bigint;
  viewTag: bigint;
}

/**
 * Audit data for compliance
 */
export interface AuditData {
  encryptedSender: [bigint, bigint, bigint, bigint];
  encryptedRecipient: [bigint, bigint, bigint, bigint];
  encryptedAmount: [bigint, bigint, bigint, bigint];
}
