import { buildPoseidon, Poseidon } from "circomlibjs";

let poseidonInstance: Poseidon | null = null;
let F: any = null;

/**
 * Initialize the Poseidon hasher
 * Must be called before using any hash functions
 */
export async function initPoseidon(): Promise<void> {
  if (poseidonInstance) return;

  poseidonInstance = await buildPoseidon();
  F = poseidonInstance.F;
}

/**
 * Ensure Poseidon is initialized
 */
function ensureInitialized(): void {
  if (!poseidonInstance || !F) {
    throw new Error("Poseidon not initialized. Call initPoseidon() first.");
  }
}

/**
 * Hash two field elements using Poseidon
 */
export function hash2(a: bigint, b: bigint): bigint {
  ensureInitialized();
  return F.toObject(poseidonInstance!([a, b]));
}

/**
 * Compute a commitment from balance and randomness
 * commitment = Poseidon(balance, randomness)
 */
export function computeCommitment(balance: bigint, randomness: bigint): bigint {
  return hash2(balance, randomness);
}

/**
 * Compute nullifier from secret and commitment
 * nullifier = Poseidon(nullifierSecret, commitment)
 */
export function computeNullifier(
  nullifierSecret: bigint,
  commitment: bigint
): bigint {
  return hash2(nullifierSecret, commitment);
}

/**
 * Get the field element converter
 */
export function getF(): any {
  ensureInitialized();
  return F;
}

/**
 * Check if Poseidon is initialized
 */
export function isInitialized(): boolean {
  return poseidonInstance !== null;
}
