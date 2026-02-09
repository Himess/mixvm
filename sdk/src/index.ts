import { ethers, Contract, Provider, Signer, Interface } from "ethers";
import {
  SDKConfig,
  PrivateNote,
  TransferResult,
  WithdrawResult,
  DepositResult,
  CrossChainTransferResult,
  CircuitPaths,
  FIELD_SIZE,
  MERKLE_DEPTH,
  StealthMetaAddress,
  IncomingPayment,
  StealthData,
  AuditData,
} from "./types";
import { StealthScanner, generateStealthPayment } from "./scanner";
import { initPoseidon, computeCommitment, computeNullifier } from "./poseidon";
import { MerkleTree } from "./merkle";
import { ProofGenerator } from "./proof";
import * as crypto from "crypto";

// Contract ABI (minimal for SDK operations)
const CONTRACT_ABI = [
  "function register(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY, bytes32 initialCommitment) external",
  "function deposit(bytes32 commitment) external payable",
  "function privateTransfer(bytes32 nullifier, bytes32 newSenderCommitment, bytes32 recipientCommitment, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] publicSignals) proof) external",
  "function withdraw(uint256 amount, bytes32 nullifier, bytes32 newCommitment, address recipient, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[5] publicSignals) proof) external",
  "function getMerkleRoot() view returns (bytes32)",
  "function nextLeafIndex() view returns (uint256)",
  "function isUserRegistered(address) view returns (bool)",
  "function usedNullifiers(bytes32) view returns (bool)",
  "function commitmentExists(bytes32) view returns (bool)",
  "function getStealthAddress(address) view returns (tuple(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY))",
  "event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)",
  "event PrivateTransferCompleted(bytes32 indexed nullifier, bytes32 newSenderCommitment, bytes32 recipientCommitment, uint256 announcementIndex, bytes32 indexed merkleRoot)",
  "event Withdrawn(address indexed user, uint256 amount, bytes32 nullifier)",
];

/**
 * Private USDC SDK for Arc Network
 *
 * @example
 * ```typescript
 * const sdk = new PrivateUSDCSDK({
 *   provider: ethersProvider,
 *   signer: ethersSigner,
 *   contractAddress: "0x...",
 * });
 *
 * await sdk.initialize();
 *
 * // Deposit
 * const deposit = await sdk.deposit(ethers.parseEther("1.0"));
 *
 * // Withdraw
 * const withdraw = await sdk.withdraw(
 *   ethers.parseEther("0.5"),
 *   deposit.note,
 *   recipientAddress
 * );
 * ```
 */
export class PrivateUSDCSDK {
  protected provider: Provider;
  protected signer?: Signer;
  protected contract: Contract;
  protected iface: Interface;
  protected merkleTree: MerkleTree;
  protected proofGenerator?: ProofGenerator;
  protected scanner: StealthScanner;
  protected initialized: boolean = false;
  protected contractAddress: string;

  // User's private keys (for stealth address scanning)
  protected viewingPrivKey?: bigint;
  protected spendingPubKeyX?: bigint;
  protected spendingPubKeyY?: bigint;

  // User's private notes
  protected notes: PrivateNote[] = [];

  constructor(config: SDKConfig) {
    this.provider = config.provider;
    this.signer = config.signer;
    this.contractAddress = config.contractAddress;
    this.iface = new Interface(CONTRACT_ABI);

    if (config.signer) {
      this.contract = new Contract(
        config.contractAddress,
        CONTRACT_ABI,
        config.signer
      );
    } else {
      this.contract = new Contract(
        config.contractAddress,
        CONTRACT_ABI,
        config.provider
      );
    }

    this.merkleTree = new MerkleTree(MERKLE_DEPTH);
    this.scanner = new StealthScanner(config.provider, config.contractAddress);

    if (config.circuitPaths) {
      this.proofGenerator = new ProofGenerator(config.circuitPaths);
    }
  }

  /**
   * Set user's private keys for stealth address scanning
   */
  setKeys(viewingPrivKey: bigint, spendingPubKeyX: bigint, spendingPubKeyY: bigint): void {
    this.viewingPrivKey = viewingPrivKey;
    this.spendingPubKeyX = spendingPubKeyX;
    this.spendingPubKeyY = spendingPubKeyY;
  }

  /**
   * Initialize the SDK (must be called before other operations)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initPoseidon();
    await this.syncMerkleTree();
    this.initialized = true;
  }

  /**
   * Ensure SDK is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SDK not initialized. Call initialize() first.");
    }
  }

  /**
   * Ensure signer is available for write operations
   */
  private ensureSigner(): Signer {
    if (!this.signer) {
      throw new Error("Signer not provided. Cannot perform write operations.");
    }
    return this.signer;
  }

  /**
   * Sync merkle tree with on-chain state
   */
  async syncMerkleTree(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000);

    const depositFilter = this.contract.filters.Deposited();
    const events = await this.contract.queryFilter(
      depositFilter,
      fromBlock,
      currentBlock
    );

    const leaves: { commitment: bigint; leafIndex: number }[] = [];

    for (const event of events) {
      const parsed = this.iface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });
      if (parsed) {
        leaves.push({
          commitment: BigInt(parsed.args.commitment),
          leafIndex: Number(parsed.args.leafIndex),
        });
      }
    }

    // Sort by leaf index
    leaves.sort((a, b) => a.leafIndex - b.leafIndex);

    // Set leaves in tree
    this.merkleTree.setLeaves(leaves.map((l) => l.commitment));
  }

  /**
   * Generate random field element
   */
  protected randomFieldElement(): bigint {
    const bytes = crypto.randomBytes(31);
    return BigInt("0x" + bytes.toString("hex")) % FIELD_SIZE;
  }

  /**
   * Convert bigint to bytes32 hex string
   */
  protected toBytes32(value: bigint): string {
    return "0x" + value.toString(16).padStart(64, "0");
  }

  // =============================================================
  // Core Operations
  // =============================================================

  /**
   * Deposit funds into private balance
   *
   * @param amount Amount to deposit (in wei)
   * @returns Deposit result with note details
   */
  async deposit(amount: bigint): Promise<DepositResult> {
    this.ensureInitialized();
    const signer = this.ensureSigner();

    const randomness = this.randomFieldElement();
    const nullifierSecret = this.randomFieldElement();
    const commitment = computeCommitment(amount, randomness);

    // Encode and send transaction
    const data = this.iface.encodeFunctionData("deposit", [
      this.toBytes32(commitment),
    ]);

    const tx = await signer.sendTransaction({
      to: await this.contract.getAddress(),
      data,
      value: amount,
    });

    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction failed");

    // Find deposit event
    const depositEvent = receipt.logs.find((log) => {
      try {
        const parsed = this.iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === "Deposited";
      } catch {
        return false;
      }
    });

    let leafIndex: number;
    if (depositEvent) {
      const parsed = this.iface.parseLog({
        topics: depositEvent.topics as string[],
        data: depositEvent.data,
      });
      leafIndex = Number(parsed!.args.leafIndex);
    } else {
      leafIndex = this.merkleTree.getLeafCount();
    }

    // Add to local tree
    this.merkleTree.addLeaf(commitment);

    // Create note
    const note: PrivateNote = {
      commitment,
      balance: amount,
      randomness,
      nullifierSecret,
      leafIndex,
    };

    this.notes.push(note);

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      commitment: this.toBytes32(commitment),
      leafIndex,
      note,
    };
  }

  /**
   * Withdraw from private balance to public address
   *
   * @param amount Amount to withdraw
   * @param note The private note to spend
   * @param recipient Address to receive funds
   * @returns Withdraw result
   */
  async withdraw(
    amount: bigint,
    note: PrivateNote,
    recipient: string
  ): Promise<WithdrawResult> {
    this.ensureInitialized();
    const signer = this.ensureSigner();

    if (!this.proofGenerator) {
      throw new Error("Circuit paths not configured. Cannot generate proof.");
    }

    if (amount > note.balance) {
      throw new Error("Insufficient balance in note");
    }

    // Compute nullifier
    const nullifier = computeNullifier(note.nullifierSecret, note.commitment);

    // Compute new commitment if partial withdrawal
    const newBalance = note.balance - amount;
    const newRandomness = this.randomFieldElement();
    const newCommitment =
      newBalance > 0n ? computeCommitment(newBalance, newRandomness) : 0n;

    // Get merkle proof
    const proof = this.merkleTree.getProof(note.leafIndex);

    // Generate ZK proof
    const { proofData } = await this.proofGenerator.generateWithdrawProof({
      merkleRoot: proof.root.toString(),
      nullifier: nullifier.toString(),
      withdrawAmount: amount.toString(),
      newCommitment: newCommitment.toString(),
      recipientAddress: BigInt(recipient).toString(),
      balance: note.balance.toString(),
      randomness: note.randomness.toString(),
      nullifierSecret: note.nullifierSecret.toString(),
      newRandomness: newRandomness.toString(),
      merklePathElements: proof.pathElements.map((e) => e.toString()),
      merklePathIndices: proof.pathIndices.map((i) => i.toString()),
    });

    // Encode and send transaction
    const data = this.iface.encodeFunctionData("withdraw", [
      amount,
      this.toBytes32(nullifier),
      newCommitment > 0n ? this.toBytes32(newCommitment) : ethers.ZeroHash,
      recipient,
      proofData,
    ]);

    const tx = await signer.sendTransaction({
      to: await this.contract.getAddress(),
      data,
      gasLimit: 3000000,
    });

    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error("Withdraw transaction failed");
    }

    // Update local state
    const noteIndex = this.notes.findIndex(
      (n) => n.commitment === note.commitment
    );
    if (noteIndex >= 0) {
      if (newBalance > 0n) {
        // Update note with new commitment
        const newNote: PrivateNote = {
          commitment: newCommitment,
          balance: newBalance,
          randomness: newRandomness,
          nullifierSecret: this.randomFieldElement(),
          leafIndex: this.merkleTree.getLeafCount(),
        };
        this.notes[noteIndex] = newNote;
        this.merkleTree.addLeaf(newCommitment);
      } else {
        // Remove spent note
        this.notes.splice(noteIndex, 1);
      }
    }

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      nullifier: this.toBytes32(nullifier),
      amount,
      recipient,
      newCommitment: newCommitment > 0n ? this.toBytes32(newCommitment) : undefined,
    };
  }

  /**
   * Execute a private transfer to another user
   *
   * @param recipientSpendingPubKeyX Recipient's spending public key X
   * @param recipientSpendingPubKeyY Recipient's spending public key Y
   * @param recipientViewingPubKeyX Recipient's viewing public key X
   * @param recipientViewingPubKeyY Recipient's viewing public key Y
   * @param amount Amount to transfer
   * @param note The private note to spend
   * @returns Transfer result
   */
  async privateTransfer(
    recipientSpendingPubKeyX: bigint,
    recipientSpendingPubKeyY: bigint,
    recipientViewingPubKeyX: bigint,
    recipientViewingPubKeyY: bigint,
    amount: bigint,
    note: PrivateNote
  ): Promise<TransferResult> {
    this.ensureInitialized();
    const signer = this.ensureSigner();

    if (!this.proofGenerator) {
      throw new Error("Circuit paths not configured. Cannot generate proof.");
    }

    if (amount > note.balance) {
      throw new Error("Insufficient balance in note");
    }

    // Compute nullifier
    const nullifier = computeNullifier(note.nullifierSecret, note.commitment);

    // Compute new sender commitment (remaining balance)
    const newSenderBalance = note.balance - amount;
    const newSenderRandomness = this.randomFieldElement();
    const newSenderCommitment = computeCommitment(newSenderBalance, newSenderRandomness);

    // Compute recipient commitment
    const recipientRandomness = this.randomFieldElement();
    const recipientCommitment = computeCommitment(amount, recipientRandomness);

    // Generate stealth payment data
    const stealthPayment = generateStealthPayment(
      recipientSpendingPubKeyX,
      recipientSpendingPubKeyY,
      recipientViewingPubKeyX,
      recipientViewingPubKeyY
    );

    const stealthData: StealthData = {
      ephemeralPubKeyX: stealthPayment.ephemeralPubKeyX,
      ephemeralPubKeyY: stealthPayment.ephemeralPubKeyY,
      stealthAddressX: stealthPayment.stealthAddressX,
      stealthAddressY: stealthPayment.stealthAddressY,
      viewTag: stealthPayment.viewTag,
    };

    // Create audit data (placeholder - in production, encrypt with auditor's key)
    const auditData: AuditData = {
      encryptedSender: [0n, 0n, 0n, 0n],
      encryptedRecipient: [0n, 0n, 0n, 0n],
      encryptedAmount: [amount, 0n, 0n, 0n],
    };

    // Get merkle proof
    const merkleProof = this.merkleTree.getProof(note.leafIndex);

    // Generate ZK proof
    const { proofData } = await this.proofGenerator.generateTransferProof({
      merkleRoot: merkleProof.root.toString(),
      nullifier: nullifier.toString(),
      newSenderCommitment: newSenderCommitment.toString(),
      recipientCommitment: recipientCommitment.toString(),
      senderBalance: note.balance.toString(),
      senderRandomness: note.randomness.toString(),
      senderNullifierSecret: note.nullifierSecret.toString(),
      transferAmount: amount.toString(),
      newSenderRandomness: newSenderRandomness.toString(),
      recipientRandomness: recipientRandomness.toString(),
      merklePathElements: merkleProof.pathElements.map((e) => e.toString()),
      merklePathIndices: merkleProof.pathIndices.map((i) => i.toString()),
    });

    // Format for contract call
    const formattedStealthData = {
      ephemeralPubKeyX: stealthData.ephemeralPubKeyX,
      ephemeralPubKeyY: stealthData.ephemeralPubKeyY,
      stealthAddressX: stealthData.stealthAddressX,
      stealthAddressY: stealthData.stealthAddressY,
      viewTag: stealthData.viewTag,
    };

    const formattedAuditData = {
      encryptedSender: auditData.encryptedSender,
      encryptedRecipient: auditData.encryptedRecipient,
      encryptedAmount: auditData.encryptedAmount,
    };

    const formattedProofData = {
      pA: proofData.pA,
      pB: proofData.pB,
      pC: proofData.pC,
      publicSignals: proofData.publicSignals,
    };

    // Encode and send transaction
    const data = this.iface.encodeFunctionData("privateTransfer", [
      this.toBytes32(nullifier),
      this.toBytes32(newSenderCommitment),
      this.toBytes32(recipientCommitment),
      formattedStealthData,
      formattedAuditData,
      formattedProofData,
    ]);

    const tx = await signer.sendTransaction({
      to: await this.contract.getAddress(),
      data,
      gasLimit: 3000000,
    });

    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error("Private transfer transaction failed");
    }

    // Find announcement index from event
    let announcementIndex = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = this.iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "PrivateTransferCompleted") {
          announcementIndex = Number(parsed.args.announcementIndex);
          break;
        }
      } catch {
        // Skip unparseable logs
      }
    }

    // Update local state
    const noteIndex = this.notes.findIndex(
      (n) => n.commitment === note.commitment
    );
    if (noteIndex >= 0) {
      // Update note with new commitment
      const newNote: PrivateNote = {
        commitment: newSenderCommitment,
        balance: newSenderBalance,
        randomness: newSenderRandomness,
        nullifierSecret: this.randomFieldElement(),
        leafIndex: this.merkleTree.getLeafCount(),
      };
      this.notes[noteIndex] = newNote;
      this.merkleTree.addLeaf(newSenderCommitment);
      this.merkleTree.addLeaf(recipientCommitment);
    }

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      nullifier: this.toBytes32(nullifier),
      newSenderCommitment: this.toBytes32(newSenderCommitment),
      recipientCommitment: this.toBytes32(recipientCommitment),
      announcementIndex,
    };
  }

  /**
   * Scan for incoming payments using stealth addresses
   *
   * @param fromBlock Starting block number (optional)
   * @returns Array of incoming payments
   */
  async scanForPayments(fromBlock?: number): Promise<IncomingPayment[]> {
    this.ensureInitialized();

    if (!this.viewingPrivKey || !this.spendingPubKeyX || !this.spendingPubKeyY) {
      throw new Error("Keys not set. Call setKeys() first.");
    }

    return await this.scanner.scanForPayments(
      this.viewingPrivKey,
      this.spendingPubKeyX,
      this.spendingPubKeyY,
      fromBlock
    );
  }

  /**
   * Get total private balance
   */
  getBalance(): bigint {
    return this.notes.reduce((sum, note) => sum + note.balance, 0n);
  }

  /**
   * Get all private notes
   */
  getNotes(): PrivateNote[] {
    return [...this.notes];
  }

  /**
   * Add a note (for importing/restoring state)
   */
  addNote(note: PrivateNote): void {
    this.notes.push(note);
  }

  /**
   * Get current merkle root
   */
  getMerkleRoot(): bigint {
    this.ensureInitialized();
    return this.merkleTree.getRoot();
  }

  /**
   * Get on-chain merkle root
   */
  async getOnChainMerkleRoot(): Promise<string> {
    return await this.contract.getMerkleRoot();
  }

  /**
   * Check if roots are in sync
   */
  async isInSync(): Promise<boolean> {
    const localRoot = this.toBytes32(this.getMerkleRoot());
    const onChainRoot = await this.getOnChainMerkleRoot();
    return localRoot === onChainRoot;
  }

  /**
   * Get the scanner instance for advanced scanning operations
   */
  getScanner(): StealthScanner {
    return this.scanner;
  }

  /**
   * Get recipient's stealth address from registry
   */
  async getRecipientStealthAddress(address: string): Promise<StealthMetaAddress | null> {
    try {
      const stealthAddr = await this.contract.getStealthAddress(address);
      return {
        spendingPubKeyX: BigInt(stealthAddr.spendingPubKeyX),
        spendingPubKeyY: BigInt(stealthAddr.spendingPubKeyY),
        viewingPubKeyX: BigInt(stealthAddr.viewingPubKeyX),
        viewingPubKeyY: BigInt(stealthAddr.viewingPubKeyY),
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a user is registered
   */
  async isUserRegistered(address: string): Promise<boolean> {
    return await this.contract.isUserRegistered(address);
  }

  /**
   * Check if a nullifier has been used
   */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    return await this.contract.usedNullifiers(nullifier);
  }

  /**
   * Get the contract address
   */
  getContractAddress(): string {
    return this.contractAddress;
  }
}

/**
 * Cross-chain SDK for CCTP integration
 */
export class CrossChainPrivateUSDCSDK extends PrivateUSDCSDK {
  private cctpSourceAddress?: string;
  private cctpSourceContract?: Contract;
  private cctpSourceIface: Interface;

  private static readonly CCTP_SOURCE_ABI = [
    "function privateTransferCrossChain(uint32 destinationDomain, bytes32 nullifier, bytes32 newSenderCommitment, bytes32 recipientCommitment, uint256 amount, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] publicSignals) proof) external returns (uint64 nonce)",
    "function getDestinationContract(uint32 domain) view returns (bytes32)",
    "function getPendingTransfer(uint64 nonce) view returns (tuple(bytes32 recipientCommitment, uint256 amount, uint32 destinationDomain, bytes32 destinationContract, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, uint256 timestamp, bool completed))",
  ];

  constructor(config: SDKConfig & { cctpSourceAddress?: string }) {
    super(config);
    this.cctpSourceIface = new Interface(CrossChainPrivateUSDCSDK.CCTP_SOURCE_ABI);

    if (config.cctpSourceAddress && config.signer) {
      this.cctpSourceAddress = config.cctpSourceAddress;
      this.cctpSourceContract = new Contract(
        config.cctpSourceAddress,
        CrossChainPrivateUSDCSDK.CCTP_SOURCE_ABI,
        config.signer
      );
    }
  }

  /**
   * Execute a cross-chain private transfer via CCTP
   *
   * @param destinationDomain CCTP domain ID of destination chain
   * @param recipientSpendingPubKeyX Recipient's spending public key X
   * @param recipientSpendingPubKeyY Recipient's spending public key Y
   * @param recipientViewingPubKeyX Recipient's viewing public key X
   * @param recipientViewingPubKeyY Recipient's viewing public key Y
   * @param amount Amount to transfer
   * @param note The private note to spend
   * @returns Cross-chain transfer result with CCTP nonce
   */
  async transferCrossChain(
    destinationDomain: number,
    recipientSpendingPubKeyX: bigint,
    recipientSpendingPubKeyY: bigint,
    recipientViewingPubKeyX: bigint,
    recipientViewingPubKeyY: bigint,
    amount: bigint,
    note: PrivateNote
  ): Promise<CrossChainTransferResult> {
    if (!this.cctpSourceContract || !this.cctpSourceAddress) {
      throw new Error("CCTP source contract not configured");
    }

    if (!this.proofGenerator) {
      throw new Error("Circuit paths not configured. Cannot generate proof.");
    }

    if (!this.signer) {
      throw new Error("Signer not provided. Cannot perform write operations.");
    }

    if (amount > note.balance) {
      throw new Error("Insufficient balance in note");
    }

    // 1. Compute nullifier
    const nullifier = computeNullifier(note.nullifierSecret, note.commitment);

    // 2. Compute new sender commitment (remaining balance on source chain)
    const newSenderBalance = note.balance - amount;
    const newSenderRandomness = this.randomFieldElement();
    const newSenderCommitment = newSenderBalance > 0n
      ? computeCommitment(newSenderBalance, newSenderRandomness)
      : 0n;

    // 3. Compute recipient commitment
    const recipientRandomness = this.randomFieldElement();
    const recipientCommitment = computeCommitment(amount, recipientRandomness);

    // 4. Generate stealth payment data
    const stealthPayment = generateStealthPayment(
      recipientSpendingPubKeyX,
      recipientSpendingPubKeyY,
      recipientViewingPubKeyX,
      recipientViewingPubKeyY
    );

    const stealthData: StealthData = {
      ephemeralPubKeyX: stealthPayment.ephemeralPubKeyX,
      ephemeralPubKeyY: stealthPayment.ephemeralPubKeyY,
      stealthAddressX: stealthPayment.stealthAddressX,
      stealthAddressY: stealthPayment.stealthAddressY,
      viewTag: stealthPayment.viewTag,
    };

    // 5. Create audit data (placeholder - in production encrypt with auditor's key)
    const auditData: AuditData = {
      encryptedSender: [0n, 0n, 0n, 0n],
      encryptedRecipient: [0n, 0n, 0n, 0n],
      encryptedAmount: [amount, 0n, 0n, 0n],
    };

    // 6. Get merkle proof
    const merkleProof = this.merkleTree.getProof(note.leafIndex);

    // 7. Generate ZK proof
    const { proofData } = await this.proofGenerator.generateTransferProof({
      merkleRoot: merkleProof.root.toString(),
      nullifier: nullifier.toString(),
      newSenderCommitment: newSenderCommitment.toString(),
      recipientCommitment: recipientCommitment.toString(),
      senderBalance: note.balance.toString(),
      senderRandomness: note.randomness.toString(),
      senderNullifierSecret: note.nullifierSecret.toString(),
      transferAmount: amount.toString(),
      newSenderRandomness: newSenderRandomness.toString(),
      recipientRandomness: recipientRandomness.toString(),
      merklePathElements: merkleProof.pathElements.map((e) => e.toString()),
      merklePathIndices: merkleProof.pathIndices.map((i) => i.toString()),
    });

    // 8. Format data for CCTP source contract call
    const formattedStealthData = {
      ephemeralPubKeyX: stealthData.ephemeralPubKeyX,
      ephemeralPubKeyY: stealthData.ephemeralPubKeyY,
      stealthAddressX: stealthData.stealthAddressX,
      stealthAddressY: stealthData.stealthAddressY,
      viewTag: stealthData.viewTag,
    };

    const formattedAuditData = {
      encryptedSender: auditData.encryptedSender,
      encryptedRecipient: auditData.encryptedRecipient,
      encryptedAmount: auditData.encryptedAmount,
    };

    const formattedProofData = {
      pA: proofData.pA,
      pB: proofData.pB,
      pC: proofData.pC,
      publicSignals: proofData.publicSignals,
    };

    // 9. Encode and send transaction to CCTP source
    const data = this.cctpSourceIface.encodeFunctionData("privateTransferCrossChain", [
      destinationDomain,
      this.toBytes32(nullifier),
      newSenderCommitment > 0n ? this.toBytes32(newSenderCommitment) : ethers.ZeroHash,
      this.toBytes32(recipientCommitment),
      amount,
      formattedStealthData,
      formattedAuditData,
      formattedProofData,
    ]);

    const tx = await this.signer.sendTransaction({
      to: this.cctpSourceAddress,
      data,
      gasLimit: 3000000,
    });

    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error("Cross-chain transfer transaction failed");
    }

    // 10. Extract CCTP nonce from event
    let cctpNonce = 0n;
    for (const log of receipt.logs) {
      try {
        const parsed = this.cctpSourceIface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "CrossChainTransferInitiated") {
          cctpNonce = BigInt(parsed.args.nonce);
          break;
        }
      } catch {
        // Skip unparseable logs
      }
    }

    // 11. Update local state
    const noteIndex = this.notes.findIndex(
      (n) => n.commitment === note.commitment
    );
    if (noteIndex >= 0) {
      if (newSenderBalance > 0n) {
        // Update note with new commitment for remaining balance
        const newNote: PrivateNote = {
          commitment: newSenderCommitment,
          balance: newSenderBalance,
          randomness: newSenderRandomness,
          nullifierSecret: this.randomFieldElement(),
          leafIndex: this.merkleTree.getLeafCount(),
        };
        this.notes[noteIndex] = newNote;
        this.merkleTree.addLeaf(newSenderCommitment);
      } else {
        // Remove spent note
        this.notes.splice(noteIndex, 1);
      }
    }

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      nullifier: this.toBytes32(nullifier),
      newSenderCommitment: newSenderCommitment > 0n ? this.toBytes32(newSenderCommitment) : undefined,
      recipientCommitment: this.toBytes32(recipientCommitment),
      cctpNonce,
      destinationDomain,
    };
  }

  /**
   * Get destination contract address for a domain
   */
  async getDestinationContract(domain: number): Promise<string> {
    if (!this.cctpSourceContract) {
      throw new Error("CCTP source contract not configured");
    }
    return await this.cctpSourceContract.getDestinationContract(domain);
  }

  /**
   * Get pending transfer by nonce
   */
  async getPendingTransfer(nonce: bigint): Promise<{
    recipientCommitment: string;
    amount: bigint;
    destinationDomain: number;
    destinationContract: string;
    timestamp: bigint;
    completed: boolean;
  }> {
    if (!this.cctpSourceContract) {
      throw new Error("CCTP source contract not configured");
    }
    const transfer = await this.cctpSourceContract.getPendingTransfer(nonce);
    return {
      recipientCommitment: transfer.recipientCommitment,
      amount: BigInt(transfer.amount),
      destinationDomain: Number(transfer.destinationDomain),
      destinationContract: transfer.destinationContract,
      timestamp: BigInt(transfer.timestamp),
      completed: transfer.completed,
    };
  }
}

// Re-export types and utilities
export * from "./types";
export * from "./poseidon";
export * from "./merkle";
export * from "./proof";
export * from "./scanner";
export * from "./chains";
