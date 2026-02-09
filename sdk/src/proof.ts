import * as snarkjs from "snarkjs";
import * as fs from "fs";
import { ProofData, CircuitPaths } from "./types";

/**
 * Proof generator for ZK circuits
 */
export class ProofGenerator {
  private circuitPaths: CircuitPaths;

  constructor(circuitPaths: CircuitPaths) {
    this.circuitPaths = circuitPaths;
  }

  /**
   * Generate a transfer proof
   */
  async generateTransferProof(inputs: {
    merkleRoot: string;
    nullifier: string;
    newSenderCommitment: string;
    recipientCommitment: string;
    senderBalance: string;
    senderRandomness: string;
    senderNullifierSecret: string;
    transferAmount: string;
    newSenderRandomness: string;
    recipientRandomness: string;
    merklePathElements: string[];
    merklePathIndices: string[];
  }): Promise<{ proofData: ProofData; publicSignals: string[] }> {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      this.circuitPaths.transferWasm,
      this.circuitPaths.transferZkey
    );

    // Verify locally
    const vkey = JSON.parse(
      fs.readFileSync(this.circuitPaths.transferVkey, "utf8")
    );
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    if (!valid) {
      throw new Error("Transfer proof verification failed locally");
    }

    const proofData = this.formatProofForContract(proof, publicSignals);
    return { proofData, publicSignals };
  }

  /**
   * Generate a withdraw proof
   */
  async generateWithdrawProof(inputs: {
    merkleRoot: string;
    nullifier: string;
    withdrawAmount: string;
    newCommitment: string;
    recipientAddress: string;
    balance: string;
    randomness: string;
    nullifierSecret: string;
    newRandomness: string;
    merklePathElements: string[];
    merklePathIndices: string[];
  }): Promise<{ proofData: ProofData; publicSignals: string[] }> {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      this.circuitPaths.withdrawWasm,
      this.circuitPaths.withdrawZkey
    );

    // Verify locally
    const vkey = JSON.parse(
      fs.readFileSync(this.circuitPaths.withdrawVkey, "utf8")
    );
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    if (!valid) {
      throw new Error("Withdraw proof verification failed locally");
    }

    const proofData = this.formatProofForContract(proof, publicSignals);
    return { proofData, publicSignals };
  }

  /**
   * Format proof for Solidity contract
   */
  private formatProofForContract(
    proof: snarkjs.Groth16Proof,
    publicSignals: string[]
  ): ProofData {
    return {
      pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      pB: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      publicSignals: publicSignals.map((s) => BigInt(s)),
    };
  }

  /**
   * Export proof as Solidity calldata string
   */
  async exportSolidityCalldata(
    proof: snarkjs.Groth16Proof,
    publicSignals: string[]
  ): Promise<string> {
    return await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  }
}

/**
 * Parse Solidity calldata string into ProofData
 */
export function parseCalldata(calldata: string): ProofData {
  const parsed = JSON.parse("[" + calldata + "]");

  return {
    pA: [BigInt(parsed[0][0]), BigInt(parsed[0][1])],
    pB: [
      [BigInt(parsed[1][0][0]), BigInt(parsed[1][0][1])],
      [BigInt(parsed[1][1][0]), BigInt(parsed[1][1][1])],
    ],
    pC: [BigInt(parsed[2][0]), BigInt(parsed[2][1])],
    publicSignals: parsed[3].map((s: string) => BigInt(s)),
  };
}
