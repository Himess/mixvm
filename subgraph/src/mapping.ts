import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  Registered,
  Deposited,
  PrivateTransferCompleted,
  StealthPaymentAnnounced,
  Withdrawn,
} from "../generated/PrivateUSDC/PrivateUSDCComplete";
import {
  Commitment,
  MerkleTree,
  Deposit,
  Transfer,
  Withdrawal,
  StealthAnnouncement,
  Nullifier,
  Registration,
  DailyStats,
} from "../generated/schema";

// Helper to get or create MerkleTree singleton
function getOrCreateMerkleTree(): MerkleTree {
  let tree = MerkleTree.load("current");
  if (tree == null) {
    tree = new MerkleTree("current");
    tree.root = Bytes.empty();
    tree.leafCount = BigInt.fromI32(0);
    tree.lastUpdateBlock = BigInt.fromI32(0);
    tree.lastUpdateTimestamp = BigInt.fromI32(0);
  }
  return tree;
}

// Helper to get date string from timestamp
function getDateString(timestamp: BigInt): string {
  let seconds = timestamp.toI64();
  let days = seconds / 86400;
  let date = new Date(days * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

// Helper to get or create DailyStats
function getOrCreateDailyStats(timestamp: BigInt): DailyStats {
  let dateString = getDateString(timestamp);
  let stats = DailyStats.load(dateString);
  if (stats == null) {
    stats = new DailyStats(dateString);
    stats.date = dateString;
    stats.totalDeposits = BigInt.fromI32(0);
    stats.totalWithdrawals = BigInt.fromI32(0);
    stats.totalTransfers = BigInt.fromI32(0);
    stats.depositVolume = BigInt.fromI32(0);
    stats.withdrawalVolume = BigInt.fromI32(0);
    stats.uniqueUsers = BigInt.fromI32(0);
  }
  return stats;
}

// Handle user registration
export function handleRegistered(event: Registered): void {
  let registration = new Registration(event.params.user.toHexString());
  registration.user = event.params.user;
  registration.spendingKeyX = event.params.spendingKeyX;
  registration.spendingKeyY = event.params.spendingKeyY;
  registration.viewingKeyX = event.params.viewingKeyX;
  registration.viewingKeyY = event.params.viewingKeyY;
  registration.blockNumber = event.block.number;
  registration.blockTimestamp = event.block.timestamp;
  registration.transactionHash = event.transaction.hash;
  registration.save();
}

// Handle deposits
export function handleDeposited(event: Deposited): void {
  let id =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();

  // Create Deposit entity
  let deposit = new Deposit(id);
  deposit.user = event.params.user;
  deposit.amount = event.params.amount;
  deposit.commitment = event.params.commitment;
  deposit.leafIndex = event.params.leafIndex;
  deposit.blockNumber = event.block.number;
  deposit.blockTimestamp = event.block.timestamp;
  deposit.transactionHash = event.transaction.hash;
  deposit.save();

  // Create Commitment entity
  let commitment = new Commitment(event.params.commitment.toHexString());
  commitment.commitment = event.params.commitment;
  commitment.leafIndex = event.params.leafIndex;
  commitment.blockNumber = event.block.number;
  commitment.blockTimestamp = event.block.timestamp;
  commitment.transactionHash = event.transaction.hash;
  commitment.type = "deposit";
  commitment.save();

  // Update MerkleTree
  let tree = getOrCreateMerkleTree();
  tree.leafCount = tree.leafCount.plus(BigInt.fromI32(1));
  tree.lastUpdateBlock = event.block.number;
  tree.lastUpdateTimestamp = event.block.timestamp;
  tree.save();

  // Update DailyStats
  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalDeposits = stats.totalDeposits.plus(BigInt.fromI32(1));
  stats.depositVolume = stats.depositVolume.plus(event.params.amount);
  stats.save();
}

// Handle private transfers
export function handlePrivateTransferCompleted(
  event: PrivateTransferCompleted
): void {
  let id = event.params.nullifier.toHexString();

  // Create Transfer entity
  let transfer = new Transfer(id);
  transfer.nullifier = event.params.nullifier;
  transfer.newSenderCommitment = event.params.newSenderCommitment;
  transfer.recipientCommitment = event.params.recipientCommitment;
  transfer.announcementIndex = event.params.announcementIndex;
  transfer.merkleRoot = event.params.merkleRoot;
  transfer.blockNumber = event.block.number;
  transfer.blockTimestamp = event.block.timestamp;
  transfer.transactionHash = event.transaction.hash;
  transfer.save();

  // Create Nullifier entity
  let nullifier = new Nullifier(event.params.nullifier.toHexString());
  nullifier.nullifier = event.params.nullifier;
  nullifier.usedInBlock = event.block.number;
  nullifier.usedInTx = event.transaction.hash;
  nullifier.usedAt = event.block.timestamp;
  nullifier.save();

  // Create Commitment entities for new commitments
  let tree = getOrCreateMerkleTree();

  // Sender's new commitment
  let senderCommitment = new Commitment(
    event.params.newSenderCommitment.toHexString()
  );
  senderCommitment.commitment = event.params.newSenderCommitment;
  senderCommitment.leafIndex = tree.leafCount;
  senderCommitment.blockNumber = event.block.number;
  senderCommitment.blockTimestamp = event.block.timestamp;
  senderCommitment.transactionHash = event.transaction.hash;
  senderCommitment.type = "transfer_sender";
  senderCommitment.save();

  // Recipient's commitment
  let recipientCommitment = new Commitment(
    event.params.recipientCommitment.toHexString()
  );
  recipientCommitment.commitment = event.params.recipientCommitment;
  recipientCommitment.leafIndex = tree.leafCount.plus(BigInt.fromI32(1));
  recipientCommitment.blockNumber = event.block.number;
  recipientCommitment.blockTimestamp = event.block.timestamp;
  recipientCommitment.transactionHash = event.transaction.hash;
  recipientCommitment.type = "transfer_recipient";
  recipientCommitment.save();

  // Update MerkleTree
  tree.root = event.params.merkleRoot;
  tree.leafCount = tree.leafCount.plus(BigInt.fromI32(2));
  tree.lastUpdateBlock = event.block.number;
  tree.lastUpdateTimestamp = event.block.timestamp;
  tree.save();

  // Update DailyStats
  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalTransfers = stats.totalTransfers.plus(BigInt.fromI32(1));
  stats.save();
}

// Handle stealth payment announcements
export function handleStealthPaymentAnnounced(
  event: StealthPaymentAnnounced
): void {
  let id = event.params.announcementIndex.toString();

  let announcement = new StealthAnnouncement(id);
  announcement.announcementIndex = event.params.announcementIndex;
  announcement.ephemeralPubKeyX = event.params.ephemeralPubKeyX;
  announcement.stealthAddressX = event.params.stealthAddressX;
  announcement.viewTag = event.params.viewTag;
  announcement.blockNumber = event.block.number;
  announcement.blockTimestamp = event.block.timestamp;
  announcement.transactionHash = event.transaction.hash;
  announcement.save();
}

// Handle withdrawals
export function handleWithdrawn(event: Withdrawn): void {
  let id =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();

  // Create Withdrawal entity
  let withdrawal = new Withdrawal(id);
  withdrawal.user = event.params.user;
  withdrawal.amount = event.params.amount;
  withdrawal.nullifier = event.params.nullifier;
  withdrawal.blockNumber = event.block.number;
  withdrawal.blockTimestamp = event.block.timestamp;
  withdrawal.transactionHash = event.transaction.hash;
  withdrawal.save();

  // Create Nullifier entity
  let nullifier = new Nullifier(event.params.nullifier.toHexString());
  nullifier.nullifier = event.params.nullifier;
  nullifier.usedInBlock = event.block.number;
  nullifier.usedInTx = event.transaction.hash;
  nullifier.usedAt = event.block.timestamp;
  nullifier.save();

  // Update DailyStats
  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalWithdrawals = stats.totalWithdrawals.plus(BigInt.fromI32(1));
  stats.withdrawalVolume = stats.withdrawalVolume.plus(event.params.amount);
  stats.save();
}
