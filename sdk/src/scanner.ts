import { Contract, Provider, Interface } from "ethers";
import { StealthAnnouncement, IncomingPayment, FIELD_SIZE } from "./types";
import { hash2 } from "./poseidon";

// Stealth announcement event ABI
const STEALTH_EVENT_ABI = [
  "event StealthPaymentAnnounced(uint256 indexed announcementIndex, uint256 ephemeralPubKeyX, uint256 stealthAddressX, uint256 viewTag)",
];

// Full announcement struct getter
const ANNOUNCEMENT_ABI = [
  "function getAnnouncement(uint256 index) view returns (tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag, bytes32 commitment, uint256 timestamp, address sender))",
  "function getAnnouncementCount() view returns (uint256)",
  "function getAnnouncementsByViewTag(uint256 viewTag) view returns (uint256[])",
];

/**
 * StealthScanner - Scans for incoming stealth payments
 *
 * Stealth address flow:
 * 1. Sender generates ephemeral key pair
 * 2. Sender computes shared secret with recipient's viewing key
 * 3. Sender derives stealth address from shared secret + spending key
 * 4. Sender creates announcement with ephemeral pub key + view tag
 * 5. Recipient scans announcements using view tag (fast filter)
 * 6. Recipient verifies ownership with viewing private key
 */
export class StealthScanner {
  private provider: Provider;
  private contractAddress: string;
  private contract: Contract;
  private iface: Interface;

  constructor(provider: Provider, contractAddress: string) {
    this.provider = provider;
    this.contractAddress = contractAddress;
    this.iface = new Interface([...STEALTH_EVENT_ABI, ...ANNOUNCEMENT_ABI]);
    this.contract = new Contract(
      contractAddress,
      [...STEALTH_EVENT_ABI, ...ANNOUNCEMENT_ABI],
      provider
    );
  }

  /**
   * Compute view tag from shared secret
   * View tag = first byte of hash(sharedSecret)
   */
  private computeViewTag(sharedSecret: bigint): bigint {
    // Simple view tag: take lower 8 bits
    return sharedSecret & BigInt(0xff);
  }

  /**
   * Compute shared secret using ECDH
   * sharedSecret = viewingPrivKey * ephemeralPubKey (scalar multiplication)
   *
   * For simplicity in this implementation, we use Poseidon hash
   * In production, use proper BabyJubJub ECDH
   */
  private computeSharedSecret(
    ephemeralPubKeyX: bigint,
    ephemeralPubKeyY: bigint,
    viewingPrivKey: bigint
  ): bigint {
    // Simplified: hash(viewingPrivKey, ephemeralPubKeyX)
    // In production: proper ECDH on BabyJubJub curve
    return hash2(viewingPrivKey, ephemeralPubKeyX);
  }

  /**
   * Derive stealth address from shared secret and spending public key
   * stealthAddress = spendingPubKey + hash(sharedSecret) * G
   *
   * For simplicity, we hash the combination
   */
  private deriveStealthAddress(
    sharedSecret: bigint,
    spendingPubKeyX: bigint,
    spendingPubKeyY: bigint
  ): { x: bigint; y: bigint } {
    // Simplified derivation
    // In production: proper elliptic curve point addition
    const derivedX = hash2(sharedSecret, spendingPubKeyX);
    const derivedY = hash2(sharedSecret, spendingPubKeyY);
    return { x: derivedX, y: derivedY };
  }

  /**
   * Scan for incoming payments
   *
   * @param viewingPrivKey Recipient's viewing private key
   * @param spendingPubKeyX Recipient's spending public key X
   * @param spendingPubKeyY Recipient's spending public key Y
   * @param fromBlock Starting block number
   * @returns Array of incoming payments belonging to this recipient
   */
  async scanForPayments(
    viewingPrivKey: bigint,
    spendingPubKeyX: bigint,
    spendingPubKeyY: bigint,
    fromBlock?: number
  ): Promise<IncomingPayment[]> {
    const currentBlock = await this.provider.getBlockNumber();
    const startBlock = fromBlock || Math.max(0, currentBlock - 10000);

    console.log(
      `Scanning blocks ${startBlock} to ${currentBlock} for payments...`
    );

    // Get all stealth announcements
    const filter = this.contract.filters.StealthPaymentAnnounced();
    const events = await this.contract.queryFilter(
      filter,
      startBlock,
      currentBlock
    );

    console.log(`Found ${events.length} announcements`);

    const myPayments: IncomingPayment[] = [];

    for (const event of events) {
      try {
        const parsed = this.iface.parseLog({
          topics: event.topics as string[],
          data: event.data,
        });

        if (!parsed) continue;

        const announcementIndex = Number(parsed.args.announcementIndex);

        // Get full announcement details
        const announcement = await this.contract.getAnnouncement(
          announcementIndex
        );

        const ephemeralPubKeyX = BigInt(announcement.ephemeralPubKeyX);
        const ephemeralPubKeyY = BigInt(announcement.ephemeralPubKeyY);
        const announcementViewTag = BigInt(announcement.viewTag);

        // Quick filter: check view tag first
        const sharedSecret = this.computeSharedSecret(
          ephemeralPubKeyX,
          ephemeralPubKeyY,
          viewingPrivKey
        );
        const computedViewTag = this.computeViewTag(sharedSecret);

        if (computedViewTag !== announcementViewTag) {
          // View tag doesn't match, skip
          continue;
        }

        // View tag matches, verify full stealth address
        const expectedStealth = this.deriveStealthAddress(
          sharedSecret,
          spendingPubKeyX,
          spendingPubKeyY
        );

        const stealthX = BigInt(announcement.stealthAddressX);
        const stealthY = BigInt(announcement.stealthAddressY);

        // Check if stealth address matches
        if (expectedStealth.x === stealthX && expectedStealth.y === stealthY) {
          console.log(
            `Found payment at announcement ${announcementIndex}!`
          );

          myPayments.push({
            commitment: announcement.commitment,
            sharedSecret,
            blockNumber: event.blockNumber,
            announcementIndex,
            stealthAddress: { x: stealthX, y: stealthY },
          });
        }
      } catch (error) {
        // Skip failed parsing
        console.warn(`Error processing announcement:`, error);
      }
    }

    return myPayments;
  }

  /**
   * Scan using view tag filter (faster)
   * Only fetches announcements with matching view tags
   */
  async scanByViewTag(
    viewingPrivKey: bigint,
    spendingPubKeyX: bigint,
    spendingPubKeyY: bigint,
    expectedViewTag: bigint
  ): Promise<IncomingPayment[]> {
    // Get announcement indices for this view tag
    const indices = await this.contract.getAnnouncementsByViewTag(
      expectedViewTag
    );

    console.log(`Found ${indices.length} announcements with view tag ${expectedViewTag}`);

    const myPayments: IncomingPayment[] = [];

    for (const index of indices) {
      try {
        const announcement = await this.contract.getAnnouncement(index);

        const ephemeralPubKeyX = BigInt(announcement.ephemeralPubKeyX);
        const ephemeralPubKeyY = BigInt(announcement.ephemeralPubKeyY);

        const sharedSecret = this.computeSharedSecret(
          ephemeralPubKeyX,
          ephemeralPubKeyY,
          viewingPrivKey
        );

        const expectedStealth = this.deriveStealthAddress(
          sharedSecret,
          spendingPubKeyX,
          spendingPubKeyY
        );

        const stealthX = BigInt(announcement.stealthAddressX);
        const stealthY = BigInt(announcement.stealthAddressY);

        if (expectedStealth.x === stealthX && expectedStealth.y === stealthY) {
          myPayments.push({
            commitment: announcement.commitment,
            sharedSecret,
            blockNumber: 0, // Not available from this query
            announcementIndex: Number(index),
            stealthAddress: { x: stealthX, y: stealthY },
          });
        }
      } catch (error) {
        console.warn(`Error processing announcement ${index}:`, error);
      }
    }

    return myPayments;
  }

  /**
   * Get total announcement count
   */
  async getAnnouncementCount(): Promise<number> {
    const count = await this.contract.getAnnouncementCount();
    return Number(count);
  }

  /**
   * Get a specific announcement
   */
  async getAnnouncement(index: number): Promise<StealthAnnouncement | null> {
    try {
      const ann = await this.contract.getAnnouncement(index);
      return {
        ephemeralPubKeyX: BigInt(ann.ephemeralPubKeyX),
        ephemeralPubKeyY: BigInt(ann.ephemeralPubKeyY),
        stealthAddressX: BigInt(ann.stealthAddressX),
        stealthAddressY: BigInt(ann.stealthAddressY),
        viewTag: BigInt(ann.viewTag),
        commitment: ann.commitment,
        timestamp: Number(ann.timestamp),
        sender: ann.sender,
        blockNumber: 0,
        announcementIndex: index,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Generate stealth address data for a payment
 * Used by sender to create stealth payment
 */
export function generateStealthPayment(
  recipientSpendingPubKeyX: bigint,
  recipientSpendingPubKeyY: bigint,
  recipientViewingPubKeyX: bigint,
  recipientViewingPubKeyY: bigint
): {
  ephemeralPrivKey: bigint;
  ephemeralPubKeyX: bigint;
  ephemeralPubKeyY: bigint;
  stealthAddressX: bigint;
  stealthAddressY: bigint;
  viewTag: bigint;
  sharedSecret: bigint;
} {
  // Generate ephemeral key pair
  const crypto = require("crypto");
  const ephemeralPrivKey =
    BigInt("0x" + crypto.randomBytes(31).toString("hex")) % FIELD_SIZE;

  // Compute ephemeral public key (simplified)
  // In production: proper BabyJubJub scalar multiplication
  const ephemeralPubKeyX = hash2(ephemeralPrivKey, BigInt(1));
  const ephemeralPubKeyY = hash2(ephemeralPrivKey, BigInt(2));

  // Compute shared secret
  // sharedSecret = ephemeralPrivKey * viewingPubKey
  // Simplified: hash combination
  const sharedSecret = hash2(ephemeralPrivKey, recipientViewingPubKeyX);

  // Compute view tag
  const viewTag = sharedSecret & BigInt(0xff);

  // Derive stealth address
  const stealthAddressX = hash2(sharedSecret, recipientSpendingPubKeyX);
  const stealthAddressY = hash2(sharedSecret, recipientSpendingPubKeyY);

  return {
    ephemeralPrivKey,
    ephemeralPubKeyX,
    ephemeralPubKeyY,
    stealthAddressX,
    stealthAddressY,
    viewTag,
    sharedSecret,
  };
}
