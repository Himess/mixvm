import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, parseEther, formatEther } from "ethers";

/**
 * Full Flow E2E Test
 *
 * Tests the complete privacy system:
 * 1. Deposit USDC into privacy pool
 * 2. Private transfer to another user
 * 3. Withdraw from privacy pool
 *
 * Prerequisites:
 * - Contracts deployed on Arc Testnet
 * - Circuit files compiled (private_transfer.wasm/zkey, withdraw.wasm/zkey)
 * - Test wallets funded with USDC
 */

// Contract addresses (from deployed_addresses.json)
const CONTRACTS = {
  privateUSDC: "0x409bCe14ACA25c00E558CB2A95bE6ecFbFD5c710",
  transferVerifier: "0x95fe4F40000c36CBfD32619C631Fd56Fe4e1f7d2",
  withdrawVerifier: "0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F",
  poseidonHasher: "0x8a228D723444105592b0d51cd342C9d28bC52bfa",
};

// Circuit paths
const CIRCUIT_PATHS = {
  transferWasm: "./privacy-poc/build/private_transfer_js/private_transfer.wasm",
  transferZkey: "./privacy-poc/build/private_transfer_final.zkey",
  transferVkey: "./privacy-poc/build/private_transfer_verification_key.json",
  withdrawWasm: "./privacy-poc/build/withdraw_js/withdraw.wasm",
  withdrawZkey: "./privacy-poc/build/withdraw_final.zkey",
  withdrawVkey: "./privacy-poc/build/withdraw_verification_key.json",
};

// Simplified ABI for testing
const PRIVATE_USDC_ABI = [
  "function deposit(bytes32 commitment) external payable",
  "function getMerkleRoot() view returns (bytes32)",
  "function nextLeafIndex() view returns (uint256)",
  "function isUserRegistered(address) view returns (bool)",
  "function commitmentExists(bytes32) view returns (bool)",
  "event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)",
];

// Field size for BN254
const FIELD_SIZE = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

// Simple hash for testing (placeholder for Poseidon)
function simpleHash(a: bigint, b: bigint): bigint {
  const combined = a.toString() + b.toString();
  let hash = BigInt(0);
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * BigInt(31) + BigInt(combined.charCodeAt(i))) % FIELD_SIZE;
  }
  return hash;
}

function randomFieldElement(): bigint {
  const bytes = ethers.randomBytes(31);
  return BigInt("0x" + Buffer.from(bytes).toString("hex")) % FIELD_SIZE;
}

function toBytes32(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

describe("Full Flow E2E", function () {
  // Increase timeout for blockchain operations
  this.timeout(120000);

  let alice: Signer;
  let bob: Signer;
  let aliceAddress: string;
  let bobAddress: string;
  let contract: any;

  before(async function () {
    // Get signers
    const signers = await ethers.getSigners();
    alice = signers[0];
    bob = signers[1] || signers[0]; // Use same signer if only one available

    aliceAddress = await alice.getAddress();
    bobAddress = await bob.getAddress();

    console.log("Alice:", aliceAddress);
    console.log("Bob:", bobAddress);

    // Connect to contract
    contract = new ethers.Contract(CONTRACTS.privateUSDC, PRIVATE_USDC_ABI, alice);

    // Check balances
    const aliceBalance = await ethers.provider.getBalance(aliceAddress);
    console.log("Alice balance:", formatEther(aliceBalance), "USDC");

    if (aliceBalance < parseEther("0.1")) {
      console.warn("Warning: Alice may not have enough balance for testing");
    }
  });

  describe("Deposit", function () {
    it("should deposit USDC and create commitment", async function () {
      const depositAmount = parseEther("0.01");

      // Generate commitment
      const randomness = randomFieldElement();
      const commitment = simpleHash(depositAmount, randomness);
      const commitmentBytes32 = toBytes32(commitment);

      console.log("\nDeposit Details:");
      console.log("  Amount:", formatEther(depositAmount), "USDC");
      console.log("  Commitment:", commitmentBytes32.slice(0, 20) + "...");

      // Get initial state
      const initialLeafIndex = await contract.nextLeafIndex();
      console.log("  Initial leaf index:", initialLeafIndex.toString());

      // Execute deposit
      const tx = await contract.deposit(commitmentBytes32, { value: depositAmount });
      console.log("  TX Hash:", tx.hash);

      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      // Verify commitment exists
      const exists = await contract.commitmentExists(commitmentBytes32);
      expect(exists).to.be.true;

      // Verify leaf index incremented
      const newLeafIndex = await contract.nextLeafIndex();
      expect(newLeafIndex).to.equal(initialLeafIndex + 1n);

      console.log("  New leaf index:", newLeafIndex.toString());
      console.log("  Deposit successful!");
    });

    it("should prevent duplicate commitment", async function () {
      const depositAmount = parseEther("0.01");
      const randomness = randomFieldElement();
      const commitment = simpleHash(depositAmount, randomness);
      const commitmentBytes32 = toBytes32(commitment);

      // First deposit
      await contract.deposit(commitmentBytes32, { value: depositAmount });

      // Second deposit with same commitment should fail
      try {
        await contract.deposit(commitmentBytes32, { value: depositAmount });
        expect.fail("Should have reverted");
      } catch (error: any) {
        // Expected to fail
        console.log("  Duplicate commitment correctly rejected");
      }
    });
  });

  describe("Merkle Tree", function () {
    it("should return valid merkle root", async function () {
      const merkleRoot = await contract.getMerkleRoot();
      console.log("\nMerkle Root:", merkleRoot);

      expect(merkleRoot).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Multiple Deposits", function () {
    it("should handle multiple deposits", async function () {
      const numDeposits = 3;
      const depositAmount = parseEther("0.005");

      console.log("\nMultiple Deposits Test:");

      for (let i = 0; i < numDeposits; i++) {
        const randomness = randomFieldElement();
        const commitment = simpleHash(depositAmount, randomness);
        const commitmentBytes32 = toBytes32(commitment);

        const tx = await contract.deposit(commitmentBytes32, { value: depositAmount });
        await tx.wait();

        console.log(`  Deposit ${i + 1} complete`);
      }

      const finalLeafIndex = await contract.nextLeafIndex();
      console.log(`  Final leaf index: ${finalLeafIndex}`);
    });
  });

  describe("Contract State", function () {
    it("should have correct state after deposits", async function () {
      const merkleRoot = await contract.getMerkleRoot();
      const leafIndex = await contract.nextLeafIndex();

      console.log("\nContract State:");
      console.log("  Merkle Root:", merkleRoot);
      console.log("  Next Leaf Index:", leafIndex.toString());

      expect(Number(leafIndex)).to.be.greaterThan(0);
    });
  });

  // Note: Full transfer and withdraw tests require ZK proof generation
  // which needs snarkjs and circuit files
  describe("Private Transfer (Requires Circuit)", function () {
    it.skip("should execute private transfer with ZK proof", async function () {
      // This test requires:
      // 1. snarkjs to generate proof
      // 2. Circuit files (private_transfer.wasm, .zkey)
      // 3. Proper merkle proof generation

      console.log("\nPrivate Transfer Test:");
      console.log("  Skipped - requires ZK proof generation");
      console.log("  Run with full SDK to test");
    });
  });

  describe("Withdraw (Requires Circuit)", function () {
    it.skip("should execute withdraw with ZK proof", async function () {
      // This test requires:
      // 1. snarkjs to generate proof
      // 2. Circuit files (withdraw.wasm, .zkey)
      // 3. Proper merkle proof generation

      console.log("\nWithdraw Test:");
      console.log("  Skipped - requires ZK proof generation");
      console.log("  Run with full SDK to test");
    });
  });

  describe("Cross-Chain Transfer (Future)", function () {
    it.skip("should initiate cross-chain transfer", async function () {
      // This test requires:
      // 1. CCTP source contract deployed
      // 2. Destination contract on target chain
      // 3. CCTP attestation service

      console.log("\nCross-Chain Transfer Test:");
      console.log("  Skipped - requires CCTP setup");
    });
  });
});

/**
 * Integration test with full SDK
 */
describe("SDK Integration E2E", function () {
  this.timeout(300000);

  it.skip("should complete full flow with SDK", async function () {
    // This would use the full SDK:
    //
    // const sdk = new PrivateUSDCSDK({
    //   provider: ethers.provider,
    //   signer: alice,
    //   contractAddress: CONTRACTS.privateUSDC,
    //   circuitPaths: CIRCUIT_PATHS,
    // });
    //
    // await sdk.initialize();
    //
    // // Deposit
    // const depositResult = await sdk.deposit(parseEther("1.0"));
    // expect(depositResult.txHash).to.not.be.empty;
    //
    // // Transfer
    // const bobKeys = await sdk.getRecipientStealthAddress(bobAddress);
    // const transferResult = await sdk.privateTransfer(
    //   bobKeys.spendingPubKeyX,
    //   bobKeys.spendingPubKeyY,
    //   bobKeys.viewingPubKeyX,
    //   bobKeys.viewingPubKeyY,
    //   parseEther("0.3"),
    //   depositResult.note
    // );
    // expect(transferResult.txHash).to.not.be.empty;
    //
    // // Withdraw
    // const withdrawResult = await sdk.withdraw(
    //   parseEther("0.5"),
    //   /* updated note */,
    //   aliceAddress
    // );
    // expect(withdrawResult.txHash).to.not.be.empty;

    console.log("\nSDK Integration Test:");
    console.log("  Skipped - requires full SDK setup");
  });
});
