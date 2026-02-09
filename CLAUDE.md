# MixVM - Privacy-Preserving Cross-Chain Bridge

## Project Overview
Privacy bridge on EVM: Poseidon commitments + Merkle tree + Groth16 ZK proofs + nullifiers.
Cross-chain via LayerZero V2 (messaging) + CCTP V2 (USDC transfer).

## Architecture
- **Commitment:** `Poseidon(balance, randomness)` → Merkle tree (depth 10)
- **Deposit:** User sends USDC → contract inserts commitment → emits `Deposited`
- **Cross-chain:** LZ sends commitment message + CCTP V2 burns/mints USDC
- **Withdraw:** On-chain Groth16 proof verification → nullifier spent → USDC sent

## Dual Messaging: LayerZero + CCTP
- **LayerZero = messaging only** - sends commitment bytes between chains
- **CCTP V2 = USDC bridge** - burns on source via depositForBurn, mints on destination via receiveMessage
- Both fire in `initiateTransfer()`: LZ sends commitment, CCTP burns USDC
- Frontend polls Circle Iris API for attestation, then calls `receiveMessage()` on destination

## On-Chain Proof Verification (v10)
- **WithdrawVerifier** (5 public signals): merkleRoot, nullifier, withdrawAmount, newCommitment, recipientAddress
- **TransferVerifier** (4 public signals): merkleRoot, nullifier, newSenderCommitment, recipientCommitment
- `withdraw()` and `initiateTransfer()` both require `merkleRoot` param + `isKnownRoot()` check
- Frontend uses `getLastRoot()` as ground truth for circuit input

## Deployed Contracts (v10.2 - Feb 8 2026)
| Chain | PrivateLZBridge | TransferVerifier | WithdrawVerifier |
|-------|----------------|------------------|------------------|
| Base Sepolia (84532) | `0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1` | `0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B` | `0x4aC6108858A2ba9C715d3E1694d413b01919A043` |
| Eth Sepolia (11155111) | `0xBe5233d68db3329c62958157854e1FE483d1b4c9` | `0x1F17d25E82B24326D899Cc17b75F7FF3a263f56b` | `0x96B97C487506813689092b0DD561a2052E7b25C4` |
| Arb Sepolia (421614) | `0x976f28253965A5bA21ad8ada897CC8383cdF206F` | `0xA9FC0Ec2A133abFcf801d8ba4c4eb4fD0C0aF467` | `0x55B4BcCdeF026c8cbF5AB495A85aa28F235a4Fed` |

## Key Files
- `contracts/PrivateLZBridge.sol` - Main bridge contract (v10: proof verification + CCTP V2)
- `contracts/PrivateTransferVerifier.sol` - Groth16 verifier for transfer circuit (4 signals)
- `contracts/WithdrawVerifier.sol` - Groth16 verifier for withdraw circuit (5 signals)
- `webapp-layerzero/src/hooks/usePrivateUSDC.ts` - Core frontend logic (withdraw with merkleRoot)
- `webapp-layerzero/src/pages/CrossChain.tsx` - Cross-chain transfer + CCTP relay
- `webapp-layerzero/src/lib/chains.ts` - Chain configs (CCTP domain + messageTransmitter)
- `webapp-layerzero/src/lib/merkle.ts` - Merkle tree builder
- `scripts/deploy-v10.ts` - Bridge deploy script
- `scripts/configure-v10-*.ts` - Peer, DVN, CCTP config scripts

## Dev Notes
- Solidity 0.8.24, optimizer, viaIR, cancun EVM
- On-chain proof verification enabled (no more TODO/skip)
- Arb Sepolia RPC doesn't support `eth_maxPriorityFeePerGas` - use getGasParams() fallback
- Poseidon gas: ~13,500-32,200 per hash + proof verification gas
- Deploy key in hardhat.config.ts (testnet only)
- User prefers Turkish, direct communication, no AI co-author references
- CCTP domains: Base=6, Eth=0, Arb=3
- CCTP TokenMessenger (all chains): `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
