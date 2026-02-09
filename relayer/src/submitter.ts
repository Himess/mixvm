import { ethers, Contract, Wallet, Provider, Interface } from "ethers";
import {
  TransferRelayRequest,
  WithdrawRelayRequest,
  TxStatus,
  RelayerConfig,
} from "./types";
import { createLogger } from "./logger";

const logger = createLogger("submitter");

// Contract ABI for relay operations
const CONTRACT_ABI = [
  "function privateTransfer(bytes32 nullifier, bytes32 newSenderCommitment, bytes32 recipientCommitment, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] publicSignals) proof) external",
  "function withdraw(uint256 amount, bytes32 nullifier, bytes32 newCommitment, address recipient, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[5] publicSignals) proof) external",
  "function usedNullifiers(bytes32) view returns (bool)",
  "function getMerkleRoot() view returns (bytes32)",
];

/**
 * Transaction submitter for relay operations
 */
export class TxSubmitter {
  private provider: Provider;
  private wallet: Wallet;
  private contract: Contract;
  private iface: Interface;
  private config: RelayerConfig;

  constructor(config: RelayerConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.iface = new Interface(CONTRACT_ABI);
    this.contract = new Contract(
      config.contractAddress,
      CONTRACT_ABI,
      this.wallet
    );
  }

  /**
   * Get relayer address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get relayer balance
   */
  async getBalance(): Promise<bigint> {
    return await this.provider.getBalance(this.wallet.address);
  }

  /**
   * Check if nullifier is already used
   */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    return await this.contract.usedNullifiers(nullifier);
  }

  /**
   * Submit transfer transaction
   */
  async submitTransfer(req: TransferRelayRequest): Promise<TxStatus> {
    logger.info("Submitting transfer transaction", {
      nullifier: req.nullifier,
    });

    try {
      // Check nullifier not already used
      const nullifierUsed = await this.isNullifierUsed(req.nullifier);
      if (nullifierUsed) {
        return {
          hash: "",
          status: "failed",
          error: "Nullifier already used",
        };
      }

      // Format proof data for contract
      const proofData = {
        pA: [BigInt(req.proof.pA[0]), BigInt(req.proof.pA[1])],
        pB: [
          [BigInt(req.proof.pB[0][0]), BigInt(req.proof.pB[0][1])],
          [BigInt(req.proof.pB[1][0]), BigInt(req.proof.pB[1][1])],
        ],
        pC: [BigInt(req.proof.pC[0]), BigInt(req.proof.pC[1])],
        publicSignals: req.proof.publicSignals.map((s) => BigInt(s)),
      };

      // Format stealth data
      const stealthData = {
        ephemeralPubKeyX: BigInt(req.stealthData.ephemeralPubKeyX),
        ephemeralPubKeyY: BigInt(req.stealthData.ephemeralPubKeyY),
        stealthAddressX: BigInt(req.stealthData.stealthAddressX),
        stealthAddressY: BigInt(req.stealthData.stealthAddressY),
        viewTag: BigInt(req.stealthData.viewTag),
      };

      // Format audit data
      const auditData = {
        encryptedSender: req.auditData.encryptedSender.map((s) => BigInt(s)),
        encryptedRecipient: req.auditData.encryptedRecipient.map((s) =>
          BigInt(s)
        ),
        encryptedAmount: req.auditData.encryptedAmount.map((s) => BigInt(s)),
      };

      // Encode function data
      const data = this.iface.encodeFunctionData("privateTransfer", [
        req.nullifier,
        req.newSenderCommitment,
        req.recipientCommitment,
        stealthData,
        auditData,
        proofData,
      ]);

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || 1000000000n;

      if (gasPrice > this.config.maxGasPrice) {
        return {
          hash: "",
          status: "failed",
          error: `Gas price too high: ${gasPrice}`,
        };
      }

      // Send transaction
      const tx = await this.wallet.sendTransaction({
        to: this.config.contractAddress,
        data,
        gasLimit: 3000000,
        gasPrice,
      });

      logger.info("Transfer TX sent", { hash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        return {
          hash: tx.hash,
          status: "failed",
          error: "Transaction reverted",
        };
      }

      logger.info("Transfer TX confirmed", {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        hash: tx.hash,
        status: "confirmed",
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Transfer TX failed", { error: errorMsg });
      return {
        hash: "",
        status: "failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Submit withdraw transaction
   */
  async submitWithdraw(req: WithdrawRelayRequest): Promise<TxStatus> {
    logger.info("Submitting withdraw transaction", {
      nullifier: req.nullifier,
      amount: req.amount,
      recipient: req.recipient,
    });

    try {
      // Check nullifier not already used
      const nullifierUsed = await this.isNullifierUsed(req.nullifier);
      if (nullifierUsed) {
        return {
          hash: "",
          status: "failed",
          error: "Nullifier already used",
        };
      }

      // Format proof data for contract (5 public signals for withdraw)
      const proofData = {
        pA: [BigInt(req.proof.pA[0]), BigInt(req.proof.pA[1])],
        pB: [
          [BigInt(req.proof.pB[0][0]), BigInt(req.proof.pB[0][1])],
          [BigInt(req.proof.pB[1][0]), BigInt(req.proof.pB[1][1])],
        ],
        pC: [BigInt(req.proof.pC[0]), BigInt(req.proof.pC[1])],
        publicSignals: req.proof.publicSignals.map((s) => BigInt(s)),
      };

      // Encode function data
      const data = this.iface.encodeFunctionData("withdraw", [
        BigInt(req.amount),
        req.nullifier,
        req.newCommitment,
        req.recipient,
        proofData,
      ]);

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || 1000000000n;

      if (gasPrice > this.config.maxGasPrice) {
        return {
          hash: "",
          status: "failed",
          error: `Gas price too high: ${gasPrice}`,
        };
      }

      // Send transaction
      const tx = await this.wallet.sendTransaction({
        to: this.config.contractAddress,
        data,
        gasLimit: 3000000,
        gasPrice,
      });

      logger.info("Withdraw TX sent", { hash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        return {
          hash: tx.hash,
          status: "failed",
          error: "Transaction reverted",
        };
      }

      logger.info("Withdraw TX confirmed", {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        hash: tx.hash,
        status: "confirmed",
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Withdraw TX failed", { error: errorMsg });
      return {
        hash: "",
        status: "failed",
        error: errorMsg,
      };
    }
  }
}
