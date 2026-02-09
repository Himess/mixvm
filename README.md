# MixVM

**Privacy-preserving cross-chain USDC bridge with ZK proofs, stealth addresses, and dual-layer messaging.**

MixVM enables private USDC transfers across EVM chains using Poseidon commitments, Groth16 zero-knowledge proofs, LayerZero V2 for cross-chain messaging, and Circle CCTP V2 for USDC movement. All proof verification happens on-chain - no trusted relayer required.

---

## How It Works

```
  Source Chain                                           Destination Chain
 +-----------------+                                   +-----------------+
 |                 |    LayerZero V2 (commitment msg)   |                 |
 |  PrivateLZBridge| ---------------------------------> |  PrivateLZBridge|
 |                 |                                   |                 |
 |  - Verify proof |    CCTP V2 (burn USDC)            |  - Insert leaf  |
 |  - Spend null.  | ---------------------------------> |  - Mint USDC    |
 |  - Insert change|                                   |                 |
 +-----------------+                                   +-----------------+
        ^                                                      |
        |                                                      v
   User deposits                                         User withdraws
   USDC + commitment                                     with ZK proof
```

**Deposit** - User sends USDC to the bridge contract along with a Poseidon commitment `H(balance, randomness)`. The commitment is inserted into an on-chain Merkle tree.

**Cross-Chain Transfer** - User generates a Groth16 proof demonstrating they own a commitment in the Merkle tree. Two things fire simultaneously:
- LayerZero sends the new commitment to the destination chain
- CCTP V2 burns USDC on source and mints it on destination

**Withdraw** - On any chain where user has a commitment, they generate a withdraw proof and the contract verifies it on-chain, marks the nullifier as spent, and sends USDC to the recipient.

The entire flow is non-custodial. Private keys, note data, and proof generation happen client-side in the browser.

---

## Architecture

### Commitment Scheme

```
commitment = Poseidon(balance, randomness)
nullifier  = Poseidon(nullifierSecret, commitment)
```

- **Merkle Tree**: Depth 10, capacity 1,024 leaves, Poseidon hashing at every level
- **Root History**: Contract stores last 100 roots in a circular buffer for async proof submission
- **Field**: BN254 scalar field (`21888242871839275222246405745257275088548364400416034343698204186575808495617`)

### ZK Circuits (Groth16)

**Private Transfer Circuit** - 4 public signals:

| Signal | Description |
|--------|-------------|
| `merkleRoot` | Root of the commitment Merkle tree |
| `nullifier` | Prevents double-spending the input note |
| `newSenderCommitment` | Change commitment for sender's remaining balance |
| `recipientCommitment` | New commitment for the recipient |

**Withdraw Circuit** - 5 public signals:

| Signal | Description |
|--------|-------------|
| `merkleRoot` | Root of the commitment Merkle tree |
| `nullifier` | Prevents double-spending |
| `withdrawAmount` | Amount of USDC to withdraw |
| `newCommitment` | Change commitment (if partial withdrawal) |
| `recipientAddress` | Ethereum address receiving the USDC |

Private inputs for both circuits include: balance, randomness, nullifier secret, Merkle path elements (10 siblings), and path indices.

### Dual-Layer Cross-Chain

MixVM uses two independent protocols for cross-chain transfers:

| Layer | Protocol | Purpose | Speed |
|-------|----------|---------|-------|
| Messaging | LayerZero V2 | Sends commitment bytes to destination Merkle tree | ~1-3 min |
| Value | CCTP V2 | Burns USDC on source, mints on destination | ~2-5 min |

Both fire in a single `initiateTransfer()` call. LayerZero delivers the commitment message, CCTP handles the actual USDC movement. The destination contract receives the commitment via `lzReceive()` and USDC is minted directly to the bridge contract by Circle's MessageTransmitter.

### Stealth Addresses

Recipients register their stealth meta-address (spending + viewing public keys) in the `StealthRegistry` contract. When sending:

1. Sender generates an ephemeral secp256k1 keypair
2. ECDH shared secret derived: `sharedSecret = ECDH(ephemeralPrivKey, recipientViewingPubKey)`
3. Note parameters derived deterministically: `randomness = keccak256(sharedSecret + ":randomness") mod p`
4. Recipient independently derives the same note params using their viewing key

This enables **automatic note detection** - the recipient scans bridge events, extracts ephemeral public keys, and tries ECDH derivation with their viewing key to find incoming transfers without any out-of-band communication.

---

## Contracts

### PrivateLZBridge.sol

The main bridge contract handling deposits, cross-chain transfers, and withdrawals with on-chain proof verification.

```solidity
// Deposit USDC into the privacy pool
function deposit(uint256 amount, bytes32 commitment) external

// Cross-chain transfer with ZK proof (LayerZero + CCTP)
function initiateTransfer(
    uint32 dstEid,                    // Destination LayerZero endpoint ID
    bytes32 recipientCommitment,      // Commitment for recipient
    uint256 amount,                   // USDC amount
    bytes32 nullifier,                // Nullifier to prevent double-spend
    bytes32 newSenderCommitment,      // Change commitment for sender
    bytes32 merkleRoot,               // Must be a known root
    uint256[8] calldata proof,        // Groth16 proof [pA(2), pB(4), pC(2)]
    StealthData calldata stealthData, // Recipient stealth address data
    AuditData calldata auditData,     // Optional encrypted audit trail
    bytes calldata options            // LayerZero gas options
) external payable returns (bytes32 guid)

// Withdraw USDC with ZK proof
function withdraw(
    address recipient,
    uint256 amount,
    bytes32 nullifier,
    bytes32 newCommitment,            // Change commitment (bytes32(0) if full withdrawal)
    bytes32 merkleRoot,
    uint256[8] calldata proof
) external

// Get LayerZero fee quote
function quote(uint32 dstEid, ...) external view returns (uint256 nativeFee, uint256 lzTokenFee)

// Read current Merkle root
function getLastRoot() external view returns (bytes32)
```

**Events:**
```solidity
event Deposited(address user, uint256 amount, bytes32 commitment, uint256 leafIndex)
event CrossChainTransferInitiated(uint32 dstEid, bytes32 recipientCommitment, uint256 amount,
                                  bytes32 nullifier, bytes32 newSenderCommitment,
                                  uint256 senderLeafIndex, bytes32 guid)
event CrossChainTransferReceived(uint32 srcEid, bytes32 commitment, uint256 amount, uint256 leafIndex)
event Withdrawn(address recipient, uint256 amount, bytes32 nullifier,
                bytes32 newCommitment, uint256 newLeafIndex)
event CCTPBurnInitiated(uint32 dstDomain, uint256 amount, uint64 cctpNonce)
```

### StealthRegistry.sol

On-chain registry for stealth meta-addresses (ERC-5564 compatible).

```solidity
// Register stealth keys for receiving private transfers
function registerStealthMetaAddress(
    uint256 spendingPubKeyX, uint256 spendingPubKeyY,
    uint256 viewingPubKeyX, uint256 viewingPubKeyY
) external

// Announce a stealth payment
function announce(uint256 schemeId, address stealthAddress,
                  bytes ephemeralPubKey, uint8 viewTag, bytes metadata) external

// Look up registered keys
function getStealthMetaAddress(address user) external view returns (StealthMetaAddress)
```

### Verifiers

- **TransferVerifier** - Groth16 verifier for the private transfer circuit (4 public inputs)
- **WithdrawVerifier** - Groth16 verifier for the withdraw circuit (5 public inputs)
- **PoseidonHasher** - On-chain Poseidon T3 hash function (~13.5k-32.2k gas per hash)

---

## Deployed Contracts (Testnet)

### Base Sepolia
| Contract | Address |
|----------|---------|
| PrivateLZBridge | `0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1` |
| TransferVerifier | `0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B` |
| WithdrawVerifier | `0x4aC6108858A2ba9C715d3E1694d413b01919A043` |
| PoseidonHasher | `0xF900978c52C9773C40Df173802f66922D57FDCec` |
| StealthRegistry | `0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

> Chain ID: 84532 | LZ EID: 40245 | CCTP Domain: 6

### Ethereum Sepolia
| Contract | Address |
|----------|---------|
| PrivateLZBridge | `0xBe5233d68db3329c62958157854e1FE483d1b4c9` |
| TransferVerifier | `0x1F17d25E82B24326D899Cc17b75F7FF3a263f56b` |
| WithdrawVerifier | `0x96B97C487506813689092b0DD561a2052E7b25C4` |
| PoseidonHasher | `0xD35f2b612F96149f9869d8Db2B0a63Bef523cb0b` |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

> Chain ID: 11155111 | LZ EID: 40161 | CCTP Domain: 0

### Arbitrum Sepolia
| Contract | Address |
|----------|---------|
| PrivateLZBridge | `0x976f28253965A5bA21ad8ada897CC8383cdF206F` |
| TransferVerifier | `0xA9FC0Ec2A133abFcf801d8ba4c4eb4fD0C0aF467` |
| WithdrawVerifier | `0x55B4BcCdeF026c8cbF5AB495A85aa28F235a4Fed` |
| PoseidonHasher | `0xB83e014c837763C4c86f21C194d7Fb613edFbE2b` |
| USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

> Chain ID: 421614 | LZ EID: 40231 | CCTP Domain: 3

### Shared Infrastructure (All Chains)
| Service | Address |
|---------|---------|
| LayerZero Endpoint V2 | `0x6EDCE65403992e310A62460808c4b910D972f10f` |
| CCTP TokenMessenger V2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| CCTP MessageTransmitter V2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |

---

## User Flow

### 1. Deposit

```
User                          Bridge Contract
 |                                  |
 |-- approve(USDC, amount) -------->|
 |-- deposit(amount, commitment) -->|
 |                                  |-- Insert commitment to Merkle tree
 |                                  |-- Emit Deposited(user, amount, commitment, leafIndex)
 |<--- Store note locally ---------|
```

The user computes `commitment = Poseidon(balance, randomness)` off-chain, approves USDC, and calls `deposit()`. The contract transfers USDC and inserts the commitment into the Merkle tree. The user stores the note data (commitment, balance, randomness, nullifierSecret, leafIndex) in browser localStorage.

### 2. Cross-Chain Transfer

```
User              Source Bridge          LayerZero        Dest Bridge         CCTP
 |                     |                    |                  |                |
 |-- initiateTransfer->|                    |                  |                |
 |                     |-- verify proof --->|                  |                |
 |                     |-- mark nullifier   |                  |                |
 |                     |-- insert change    |                  |                |
 |                     |                    |                  |                |
 |                     |-- lzSend(commitment) --------------->|                |
 |                     |                    |                  |-- insert leaf  |
 |                     |                    |                  |                |
 |                     |-- depositForBurn(USDC) -------------------------------->|
 |                     |                    |                  |     mint USDC  |
 |                     |                    |                  |<---------------|
```

The source bridge verifies the Groth16 transfer proof on-chain, spends the nullifier, inserts the sender's change commitment, then fires both LayerZero (commitment message) and CCTP (USDC burn). On the destination chain, LayerZero delivers the commitment via `lzReceive()` and CCTP mints USDC to the bridge contract.

### 3. CCTP Relay

After `initiateTransfer()`, the frontend polls Circle's Iris API for the attestation:

```
GET https://iris-api-sandbox.circle.com/v2/messages/{srcDomain}?transactionHash={txHash}
```

Once status is `complete`, the frontend switches the user to the destination chain and calls `MessageTransmitterV2.receiveMessage(message, attestation)` to mint USDC to the bridge.

### 4. Withdraw

```
User                          Bridge Contract
 |                                  |
 |-- withdraw(recipient, amount,    |
 |     nullifier, newCommitment,    |
 |     merkleRoot, proof) -------->|
 |                                  |-- Verify merkleRoot is known
 |                                  |-- Verify Groth16 proof on-chain
 |                                  |-- Mark nullifier as spent
 |                                  |-- Insert change commitment (if any)
 |                                  |-- Transfer USDC to recipient
 |<--- USDC received --------------|
```

### 5. Auto-Scan (Receive)

Recipients with registered stealth keys can auto-detect incoming transfers:

1. Scan `CrossChainTransferReceived` events on all chains
2. For each event, fetch TX calldata and extract ephemeral public key
3. Compute ECDH: `sharedSecret = ECDH(viewingPrivKey, ephemeralPubKey)`
4. Derive note params: `randomness = keccak256(sharedSecret + ":randomness") mod p`
5. Compute expected commitment: `Poseidon(amount, randomness)`
6. If commitment matches the event data, the transfer belongs to this recipient

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Smart Contracts | Solidity 0.8.24, Hardhat, viaIR optimizer |
| ZK Circuits | Circom 2, snarkjs (Groth16) |
| Hashing | Poseidon T3 (BN254-compatible) |
| Cross-Chain Messaging | LayerZero V2 |
| Cross-Chain USDC | Circle CCTP V2 |
| Stealth Addresses | secp256k1 ECDH, ERC-5564 compatible |
| Frontend | React 18, TypeScript, Vite |
| Wallet | Wagmi v2, viem |
| State | Zustand (persisted to localStorage) |
| Crypto | @noble/curves (secp256k1), circomlibjs (Poseidon) |

---

## Project Structure

```
mixvm/
├── contracts/
│   ├── PrivateLZBridge.sol          # Main bridge (deposit, transfer, withdraw)
│   ├── PrivateTransferVerifier.sol  # Groth16 verifier - transfer circuit
│   ├── WithdrawVerifier.sol         # Groth16 verifier - withdraw circuit
│   ├── StealthRegistry.sol          # Stealth meta-address registry
│   ├── interfaces/
│   │   ├── ILayerZeroEndpointV2.sol
│   │   ├── ITokenMessenger.sol      # CCTP V2 interface
│   │   └── IMessageTransmitter.sol  # CCTP V2 interface
│   └── libraries/
│       ├── PoseidonHasher.sol       # On-chain Poseidon hash
│       └── PoseidonT3.sol           # Poseidon T3 implementation
├── webapp-layerzero/                # Active frontend
│   ├── src/
│   │   ├── hooks/usePrivateUSDC.ts  # Core logic (deposit, withdraw, proof gen)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Balance overview
│   │   │   ├── Deposit.tsx          # Deposit USDC
│   │   │   ├── CrossChain.tsx       # Cross-chain transfer + CCTP relay
│   │   │   ├── Withdraw.tsx         # Withdraw with ZK proof
│   │   │   ├── Receive.tsx          # Auto-scan for incoming transfers
│   │   │   ├── Send.tsx             # Same-chain private transfer
│   │   │   └── ImportNote.tsx       # Manual note import
│   │   └── lib/
│   │       ├── chains.ts            # Chain configs + contract addresses
│   │       ├── merkle.ts            # Client-side Merkle tree
│   │       ├── stealth.ts           # Stealth address + ECDH derivation
│   │       ├── store.ts             # Zustand state (notes, txs)
│   │       └── wagmi.ts             # Wallet config
│   └── public/circuits/             # Compiled ZK circuit files
│       ├── withdraw.wasm
│       ├── withdraw_final.zkey
│       ├── private_transfer.wasm
│       └── private_transfer_final.zkey
├── scripts/                         # Deploy & config scripts
│   ├── deploy-v10.ts                # Deploy bridge to all chains
│   ├── deploy-verifiers.ts          # Deploy verifier contracts
│   ├── configure-v10-peers.ts       # Set cross-chain peers
│   ├── configure-v10-dvn.ts         # Configure LayerZero DVNs
│   └── configure-v10-cctp.ts        # Map CCTP domains
├── relayer/                         # CCTP relay service
├── sdk/                             # TypeScript SDK
└── hardhat.config.ts
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- A wallet with testnet ETH on Base Sepolia, Ethereum Sepolia, or Arbitrum Sepolia
- Testnet USDC (get from [Circle Faucet](https://faucet.circle.com/))

### Setup

```bash
# Clone
git clone https://github.com/Himess/mixvm.git
cd mixvm

# Install dependencies
npm install
cd webapp-layerzero && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your private key (for contract deployment/scripts only)

# Run the frontend
cd webapp-layerzero
npm run dev
# Open http://localhost:5174
```

### Contract Deployment

```bash
# Compile contracts
npx hardhat compile

# Deploy verifiers (if needed on new chains)
npx hardhat run scripts/deploy-verifiers.ts --network baseSepolia

# Deploy bridge
npx hardhat run scripts/deploy-v10.ts --network baseSepolia

# Configure peers, DVN, and CCTP domains
npx hardhat run scripts/configure-v10-peers.ts --network baseSepolia
npx hardhat run scripts/configure-v10-dvn.ts --network baseSepolia
npx hardhat run scripts/configure-v10-cctp.ts --network baseSepolia
```

---

## Security Model

| Property | Mechanism |
|----------|-----------|
| **Privacy** | Poseidon commitments hide balance and ownership. Only the note holder knows the preimage. |
| **Double-spend prevention** | Nullifiers are marked on-chain. Same commitment cannot be spent twice. |
| **Proof soundness** | Groth16 proofs verified on-chain by dedicated verifier contracts. No trusted server. |
| **Cross-chain integrity** | LayerZero DVN validation ensures commitment messages aren't forged. |
| **USDC custody** | CCTP V2 burn-and-mint - Circle is the custodian for cross-chain USDC movement. |
| **Stealth privacy** | ECDH-derived parameters - only recipient with viewing key can detect incoming transfers. |
| **Root freshness** | Contract maintains 100-root history buffer, proofs accepted against any recent root. |

### What MixVM Does NOT Hide

- Deposit amounts are visible on-chain (USDC transfer to contract)
- Withdraw amounts are visible on-chain (USDC transfer from contract)
- Cross-chain transfer amounts are visible (CCTP burn amount)
- The fact that *someone* is using MixVM is visible

What IS hidden: the link between depositor and withdrawer, the internal balance splits, and who is paying whom.

---

## Gas Costs

| Operation | Approximate Gas | Notes |
|-----------|----------------|-------|
| Deposit | ~150k | USDC transfer + Poseidon hash + Merkle insert |
| Withdraw (with proof) | ~500k-800k | Groth16 verification + Poseidon + USDC transfer |
| Cross-chain Transfer | ~800k-1.2M + LZ fee | Proof verification + LZ send + CCTP burn |
| lzReceive (destination) | ~300k-500k | Poseidon hash + Merkle insert |

LayerZero gas budget for `lzReceive`: 500,000 gas (configured via Type 3 enforced options).

---

## Supported Routes

| Source | Destination | LZ EID Pair |
|--------|-------------|-------------|
| Base Sepolia | Ethereum Sepolia | 40245 -> 40161 |
| Base Sepolia | Arbitrum Sepolia | 40245 -> 40231 |
| Ethereum Sepolia | Base Sepolia | 40161 -> 40245 |
| Ethereum Sepolia | Arbitrum Sepolia | 40161 -> 40231 |
| Arbitrum Sepolia | Base Sepolia | 40231 -> 40245 |
| Arbitrum Sepolia | Ethereum Sepolia | 40231 -> 40161 |

All 6 bidirectional routes are configured and operational.

---

## License

MIT
