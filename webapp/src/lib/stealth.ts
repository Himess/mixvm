/**
 * Stealth Address Library
 * Implements ERC-5564 compatible stealth address generation and scanning.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak256, bytesToHex, hexToBytes } from 'viem'

export interface StealthKeys {
  spendingPrivateKey: Uint8Array
  spendingPublicKey: Uint8Array
  viewingPrivateKey: Uint8Array
  viewingPublicKey: Uint8Array
}

export interface StealthMetaAddress {
  spendingPubKeyX: bigint
  spendingPubKeyY: bigint
  viewingPubKeyX: bigint
  viewingPubKeyY: bigint
}

export interface GeneratedStealthAddress {
  stealthAddress: string
  ephemeralPubKey: Uint8Array
  viewTag: number
}

export interface StealthAnnouncement {
  schemeId: number
  stealthAddress: string
  ephemeralPubKey: Uint8Array
  viewTag: number
  metadata?: Uint8Array
}

export interface OwnedPayment extends StealthAnnouncement {
  stealthPrivateKey: bigint
}

export function generateStealthKeys(): StealthKeys {
  const spendingPrivateKey = secp256k1.utils.randomPrivateKey()
  const viewingPrivateKey = secp256k1.utils.randomPrivateKey()
  return {
    spendingPrivateKey,
    spendingPublicKey: secp256k1.getPublicKey(spendingPrivateKey, false),
    viewingPrivateKey,
    viewingPublicKey: secp256k1.getPublicKey(viewingPrivateKey, false),
  }
}

export function getPublicKeyCoordinates(pubKey: Uint8Array): { x: bigint; y: bigint } {
  const point = secp256k1.ProjectivePoint.fromHex(pubKey)
  return { x: point.x, y: point.y }
}

export function createStealthMetaAddress(keys: StealthKeys): StealthMetaAddress {
  const spending = getPublicKeyCoordinates(keys.spendingPublicKey)
  const viewing = getPublicKeyCoordinates(keys.viewingPublicKey)
  return {
    spendingPubKeyX: spending.x,
    spendingPubKeyY: spending.y,
    viewingPubKeyX: viewing.x,
    viewingPubKeyY: viewing.y,
  }
}

export function generateStealthAddress(
  recipientSpendingPubKey: Uint8Array,
  recipientViewingPubKey: Uint8Array
): GeneratedStealthAddress {
  const ephemeralPrivateKey = secp256k1.utils.randomPrivateKey()
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivateKey, false)
  const sharedSecret = secp256k1.getSharedSecret(ephemeralPrivateKey, recipientViewingPubKey)
  const hashedSecret = keccak256(sharedSecret)
  const viewTag = parseInt(hashedSecret.slice(2, 4), 16)
  const spendingPoint = secp256k1.ProjectivePoint.fromHex(recipientSpendingPubKey)
  const hashScalar = BigInt(hashedSecret)
  const stealthPoint = spendingPoint.add(secp256k1.ProjectivePoint.BASE.multiply(hashScalar))
  const stealthPubKeyBytes = stealthPoint.toRawBytes(false)
  const stealthPubKeyHash = keccak256(stealthPubKeyBytes.slice(1))
  const stealthAddress = '0x' + stealthPubKeyHash.slice(-40)
  return { stealthAddress, ephemeralPubKey, viewTag }
}

export interface StealthDataForContract {
  stealthAddress: string
  ephemeralPubKeyX: bigint
  ephemeralPubKeyY: bigint
  stealthPubKeyX: bigint
  stealthPubKeyY: bigint
  viewTag: number
  ephemeralPubKey: Uint8Array // For announcement
}

/**
 * Generate stealth address with all coordinates needed for contract
 * This hides the recipient's real address on-chain
 */
export function generateStealthDataForTransfer(
  recipientSpendingPubKey: Uint8Array,
  recipientViewingPubKey: Uint8Array
): StealthDataForContract {
  // Generate ephemeral key pair (random, one-time use)
  const ephemeralPrivateKey = secp256k1.utils.randomPrivateKey()
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivateKey, false)

  // Get ephemeral public key coordinates
  const ephemeralPoint = secp256k1.ProjectivePoint.fromHex(ephemeralPubKey)
  const ephemeralPubKeyX = ephemeralPoint.x
  const ephemeralPubKeyY = ephemeralPoint.y

  // Compute shared secret using ECDH
  const sharedSecret = secp256k1.getSharedSecret(ephemeralPrivateKey, recipientViewingPubKey)
  const hashedSecret = keccak256(sharedSecret)
  const viewTag = parseInt(hashedSecret.slice(2, 4), 16)

  // Compute stealth public key: stealthPubKey = spendingPubKey + hash(sharedSecret) * G
  const spendingPoint = secp256k1.ProjectivePoint.fromHex(recipientSpendingPubKey)
  const hashScalar = BigInt(hashedSecret)
  const stealthPoint = spendingPoint.add(secp256k1.ProjectivePoint.BASE.multiply(hashScalar))

  // Get stealth public key coordinates
  const stealthPubKeyX = stealthPoint.x
  const stealthPubKeyY = stealthPoint.y

  // Derive stealth address from stealth public key
  const stealthPubKeyBytes = stealthPoint.toRawBytes(false)
  const stealthPubKeyHash = keccak256(stealthPubKeyBytes.slice(1))
  const stealthAddress = '0x' + stealthPubKeyHash.slice(-40)

  return {
    stealthAddress,
    ephemeralPubKeyX,
    ephemeralPubKeyY,
    stealthPubKeyX,
    stealthPubKeyY,
    viewTag,
    ephemeralPubKey,
  }
}

export function scanForStealthPayments(
  viewingPrivateKey: Uint8Array,
  spendingPublicKey: Uint8Array,
  spendingPrivateKey: Uint8Array,
  announcements: StealthAnnouncement[]
): OwnedPayment[] {
  const owned: OwnedPayment[] = []
  for (const ann of announcements) {
    const sharedSecret = secp256k1.getSharedSecret(viewingPrivateKey, ann.ephemeralPubKey)
    const hashedSecret = keccak256(sharedSecret)
    const computedViewTag = parseInt(hashedSecret.slice(2, 4), 16)
    if (computedViewTag !== ann.viewTag) continue
    const spendingPoint = secp256k1.ProjectivePoint.fromHex(spendingPublicKey)
    const hashScalar = BigInt(hashedSecret)
    const expectedStealthPoint = spendingPoint.add(secp256k1.ProjectivePoint.BASE.multiply(hashScalar))
    const expectedPubKeyBytes = expectedStealthPoint.toRawBytes(false)
    const expectedPubKeyHash = keccak256(expectedPubKeyBytes.slice(1))
    const expectedAddress = '0x' + expectedPubKeyHash.slice(-40)
    if (expectedAddress.toLowerCase() === ann.stealthAddress.toLowerCase()) {
      const spendingPrivBigInt = BigInt('0x' + bytesToHex(spendingPrivateKey).slice(2))
      const stealthPrivateKey = (spendingPrivBigInt + hashScalar) % secp256k1.CURVE.n
      owned.push({ ...ann, stealthPrivateKey })
    }
  }
  return owned
}

export function storeStealthKeys(address: string, keys: StealthKeys): void {
  const data = {
    spendingPrivateKey: bytesToHex(keys.spendingPrivateKey),
    spendingPublicKey: bytesToHex(keys.spendingPublicKey),
    viewingPrivateKey: bytesToHex(keys.viewingPrivateKey),
    viewingPublicKey: bytesToHex(keys.viewingPublicKey),
  }
  localStorage.setItem('stealth_keys_' + address.toLowerCase(), JSON.stringify(data))
}

export function loadStealthKeys(address: string): StealthKeys | null {
  const data = localStorage.getItem('stealth_keys_' + address.toLowerCase())
  if (!data) return null
  try {
    const parsed = JSON.parse(data)
    return {
      spendingPrivateKey: hexToBytes(parsed.spendingPrivateKey),
      spendingPublicKey: hexToBytes(parsed.spendingPublicKey),
      viewingPrivateKey: hexToBytes(parsed.viewingPrivateKey),
      viewingPublicKey: hexToBytes(parsed.viewingPublicKey),
    }
  } catch {
    return null
  }
}

/**
 * ECIES Encryption - Encrypt data for a recipient using their public key
 * Uses ECDH + AES-GCM
 */
export async function eciesEncrypt(
  recipientPubKey: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  // Generate ephemeral key pair
  const ephemeralPrivKey = secp256k1.utils.randomPrivateKey()
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, false)

  // Derive shared secret using ECDH
  const sharedSecret = secp256k1.getSharedSecret(ephemeralPrivKey, recipientPubKey)

  // Derive AES key from shared secret using keccak256
  const aesKeyHash = keccak256(sharedSecret)
  const aesKey = hexToBytes(aesKeyHash).slice(0, 32) // 256-bit key

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Import key for Web Crypto API
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  // Encrypt with AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintext
  )

  // Format: ephemeralPubKey (65 bytes) + iv (12 bytes) + ciphertext (variable + 16 byte tag)
  const result = new Uint8Array(65 + 12 + ciphertext.byteLength)
  result.set(ephemeralPubKey, 0)
  result.set(iv, 65)
  result.set(new Uint8Array(ciphertext), 77)

  return result
}

/**
 * ECIES Decryption - Decrypt data using private key
 */
export async function eciesDecrypt(
  privateKey: Uint8Array,
  encryptedData: Uint8Array
): Promise<Uint8Array | null> {
  try {
    if (encryptedData.length < 77 + 16) { // Min: 65 pubkey + 12 iv + 16 tag
      return null
    }

    // Extract components
    const ephemeralPubKey = encryptedData.slice(0, 65)
    const iv = encryptedData.slice(65, 77)
    const ciphertext = encryptedData.slice(77)

    // Derive shared secret using ECDH
    const sharedSecret = secp256k1.getSharedSecret(privateKey, ephemeralPubKey)

    // Derive AES key from shared secret
    const aesKeyHash = keccak256(sharedSecret)
    const aesKey = hexToBytes(aesKeyHash).slice(0, 32)

    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    // Decrypt with AES-GCM
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    )

    return new Uint8Array(plaintext)
  } catch {
    // Decryption failed - this data is not for us
    return null
  }
}

/**
 * Encrypt note data for recipient
 */
export async function encryptNoteData(
  recipientViewingPubKey: Uint8Array,
  noteData: {
    commitment: string
    balance: string
    randomness: string
    nullifierSecret: string
    leafIndex: number
  }
): Promise<string> {
  const jsonStr = JSON.stringify(noteData)
  const plaintext = new TextEncoder().encode(jsonStr)
  const encrypted = await eciesEncrypt(recipientViewingPubKey, plaintext)
  return '0x' + bytesToHex(encrypted).slice(2)
}

/**
 * Decrypt note data using viewing private key
 */
export async function decryptNoteData(
  viewingPrivateKey: Uint8Array,
  encryptedHex: string
): Promise<{
  commitment: string
  balance: string
  randomness: string
  nullifierSecret: string
  leafIndex: number
} | null> {
  try {
    const encrypted = hexToBytes(encryptedHex as `0x${string}`)
    const decrypted = await eciesDecrypt(viewingPrivateKey, encrypted)
    if (!decrypted) return null

    const jsonStr = new TextDecoder().decode(decrypted)
    const noteData = JSON.parse(jsonStr)

    // Validate structure
    if (!noteData.commitment || !noteData.balance || !noteData.randomness || !noteData.nullifierSecret) {
      return null
    }

    return noteData
  } catch {
    return null
  }
}
