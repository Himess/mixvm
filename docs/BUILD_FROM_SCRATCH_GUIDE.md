# Sıfırdan Private Transfer Sistemi Kurma Rehberi

## AvaCloud Ne Yaptı?

Bilinen, açık teknolojileri birleştirdiler:

```
┌─────────────────────────────────────────────────────────────┐
│                    eERC Bileşenleri                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Twisted ElGamal Encryption (1985, açık matematik)       │
│     └── Bakiyeleri şifreler                                 │
│                                                             │
│  2. Pedersen Commitments (1991, açık matematik)             │
│     └── Değerleri commit eder                               │
│                                                             │
│  3. zk-SNARKs / Circom (2012+, açık kaynak GPL)             │
│     └── Zero knowledge proof üretir                         │
│                                                             │
│  4. BabyJubJub Curve (açık kaynak, circomlib)               │
│     └── Eliptik eğri operasyonları                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Hiçbiri AvaCloud'un icadı değil. Hepsi açık ve kullanılabilir.
```

---

## Kullanabileceğimiz Açık Kaynak Araçlar

### 1. Circom + snarkjs (GPL Lisans)
```bash
# Circom - ZK circuit dili
npm install -g circom

# snarkjs - Proof generation/verification
npm install snarkjs
```
**Kaynak:** https://github.com/iden3/circom

### 2. circomlib (GPL Lisans)
Hazır circuit kütüphanesi:
- Pedersen hash
- EdDSA signatures
- MiMC hash
- Poseidon hash
- BabyJubJub curve operations

**Kaynak:** https://github.com/iden3/circomlib

### 3. Akademik Makaleler (Tamamen Açık)

| Makale | Konu | Link |
|--------|------|------|
| Bulletproofs (2017) | Range proofs | [eprint/2017/1066](https://eprint.iacr.org/2017/1066.pdf) |
| PGC (2019) | Confidential payments | [eprint/2019/319](https://eprint.iacr.org/2019/319.pdf) |
| Twisted ElGamal | ElGamal + Pedersen | Akademik makaleler |

---

## Kendi Sistemimizi Nasıl Yaparız?

### Adım 1: Temel Kriptografi (Hafta 1)

**ElGamal Şifreleme:**
```javascript
// Basitleştirilmiş ElGamal
class ElGamal {
    // Public key: Y = g^x
    // Encrypt: (C1, C2) = (g^r, m * Y^r)
    // Decrypt: m = C2 / C1^x

    encrypt(message, publicKey) {
        const r = randomScalar();
        const C1 = g.multiply(r);
        const C2 = message.add(publicKey.multiply(r));
        return { C1, C2 };
    }

    decrypt(ciphertext, privateKey) {
        const { C1, C2 } = ciphertext;
        return C2.subtract(C1.multiply(privateKey));
    }
}
```

**Pedersen Commitment:**
```javascript
// Commit(value, randomness) = g^value * h^randomness
// Hiding: randomness gizli olduğu sürece value gizli
// Binding: Aynı commitment farklı value veremez

function pedersenCommit(value, randomness, g, h) {
    return g.multiply(value).add(h.multiply(randomness));
}
```

### Adım 2: ZK Circuit Yazımı (Hafta 2-3)

**Transfer Circuit (Circom):**
```circom
pragma circom 2.0.0;

include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

template PrivateTransfer() {
    // === Private Inputs (kullanıcıda kalır) ===
    signal input senderBalance;        // Gönderici bakiyesi
    signal input transferAmount;       // Transfer miktarı
    signal input senderPrivateKey;     // Gönderici private key
    signal input randomness;           // Şifreleme randomness

    // === Public Inputs (zincirde görünür) ===
    signal input senderBalanceCommitment;   // Şifreli bakiye
    signal input newBalanceCommitment;      // Yeni şifreli bakiye
    signal input recipientPubKeyX;          // Alıcı public key X
    signal input recipientPubKeyY;          // Alıcı public key Y
    signal input encryptedAmountC1X;        // Şifreli miktar C1
    signal input encryptedAmountC1Y;
    signal input encryptedAmountC2X;        // Şifreli miktar C2
    signal input encryptedAmountC2Y;

    // === Constraints ===

    // 1. Bakiye yeterli mi?
    component gte = GreaterEqThan(64);
    gte.in[0] <== senderBalance;
    gte.in[1] <== transferAmount;
    gte.out === 1;

    // 2. Transfer pozitif mi?
    component gt = GreaterThan(64);
    gt.in[0] <== transferAmount;
    gt.in[1] <== 0;
    gt.out === 1;

    // 3. Yeni bakiye doğru mu?
    signal newBalance;
    newBalance <== senderBalance - transferAmount;

    // 4. Commitment doğru mu? (Pedersen)
    component commitNew = Poseidon(2);
    commitNew.inputs[0] <== newBalance;
    commitNew.inputs[1] <== randomness;
    commitNew.out === newBalanceCommitment;

    // 5. Şifreleme doğru mu? (ElGamal on BabyJubJub)
    // ... (BabyJubJub point multiplication)
}

component main {public [
    senderBalanceCommitment,
    newBalanceCommitment,
    recipientPubKeyX,
    recipientPubKeyY,
    encryptedAmountC1X,
    encryptedAmountC1Y,
    encryptedAmountC2X,
    encryptedAmountC2Y
]} = PrivateTransfer();
```

### Adım 3: Solidity Kontratları (Hafta 3-4)

**PrivateUSDC.sol:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Verifier.sol";  // snarkjs'den generate edilir

contract PrivateUSDC {
    IERC20 public usdc;
    Groth16Verifier public verifier;

    // Şifreli bakiyeler (commitment olarak)
    mapping(address => uint256) public encryptedBalances;

    // Kullanıcı public key'leri
    mapping(address => uint256[2]) public publicKeys;

    // Nullifier'lar (double-spend önleme)
    mapping(bytes32 => bool) public nullifiers;

    event Deposit(address indexed user, uint256 commitment);
    event PrivateTransfer(bytes32 indexed nullifier, uint256 newCommitment);
    event Withdraw(address indexed user, uint256 amount);

    constructor(address _usdc, address _verifier) {
        usdc = IERC20(_usdc);
        verifier = Groth16Verifier(_verifier);
    }

    // Kullanıcı kaydı
    function register(uint256[2] calldata pubKey) external {
        publicKeys[msg.sender] = pubKey;
    }

    // USDC yatır → Private bakiye al
    function deposit(uint256 amount, uint256 commitment) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        encryptedBalances[msg.sender] = commitment;
        emit Deposit(msg.sender, commitment);
    }

    // Private transfer
    function transfer(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[8] calldata _pubSignals
    ) external {
        // ZK Proof doğrula
        require(
            verifier.verifyProof(_pA, _pB, _pC, _pubSignals),
            "Invalid proof"
        );

        bytes32 nullifier = bytes32(_pubSignals[0]);
        require(!nullifiers[nullifier], "Already spent");
        nullifiers[nullifier] = true;

        // State güncelle
        // ... commitment updates

        emit PrivateTransfer(nullifier, _pubSignals[1]);
    }

    // Private bakiye → USDC çek
    function withdraw(
        uint256 amount,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals
    ) external {
        require(
            verifier.verifyProof(_pA, _pB, _pC, _pubSignals),
            "Invalid proof"
        );

        usdc.transfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }
}
```

### Adım 4: Client SDK (Hafta 5-6)

**client.ts:**
```typescript
import * as snarkjs from 'snarkjs';
import { buildBabyjub, buildPoseidon } from 'circomlibjs';

class PrivateUSDCClient {
    private privateKey: bigint;
    private publicKey: [bigint, bigint];
    private balance: bigint;
    private randomness: bigint;

    constructor(privateKey: bigint) {
        this.privateKey = privateKey;
        this.publicKey = this.derivePublicKey(privateKey);
        this.balance = 0n;
        this.randomness = this.generateRandomness();
    }

    // Client-side proof generation
    async generateTransferProof(
        amount: bigint,
        recipientPubKey: [bigint, bigint]
    ) {
        // Input hazırla
        const input = {
            senderBalance: this.balance,
            transferAmount: amount,
            senderPrivateKey: this.privateKey,
            randomness: this.randomness,
            // ... diğer inputlar
        };

        // Proof üret (tamamen client-side)
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "circuits/transfer.wasm",
            "circuits/transfer.zkey"
        );

        return { proof, publicSignals };
    }

    // Şifreleme (ElGamal)
    encryptAmount(amount: bigint, recipientPubKey: [bigint, bigint]) {
        const r = this.generateRandomness();
        const babyJub = buildBabyjub();

        const C1 = babyJub.mulPointEscalar(babyJub.Base8, r);
        const shared = babyJub.mulPointEscalar(recipientPubKey, r);
        const C2 = babyJub.addPoint(
            babyJub.mulPointEscalar(babyJub.Base8, amount),
            shared
        );

        return { C1, C2 };
    }

    // Şifre çözme
    decryptAmount(C1: any, C2: any): bigint {
        const babyJub = buildBabyjub();
        const shared = babyJub.mulPointEscalar(C1, this.privateKey);
        const M = babyJub.subPoint(C2, shared);

        // Discrete log - küçük değerler için brute force
        return this.discreteLog(M);
    }
}
```

---

## Zaman Çizelgesi

| Hafta | Görev | Çıktı |
|-------|-------|-------|
| 1 | Kriptografi temelleri | ElGamal, Pedersen implementasyonu |
| 2 | Circom öğrenme | Basit circuit'ler |
| 3 | Transfer circuit | transfer.circom |
| 4 | Solidity kontratlar | PrivateUSDC.sol, Verifier.sol |
| 5 | Client SDK | TypeScript prover |
| 6 | Entegrasyon | Arc Testnet deploy |
| 7 | Test | E2E testler |
| 8 | Demo | Çalışan PoC |

---

## Zorluk Seviyesi

| Bileşen | Zorluk | Neden |
|---------|--------|-------|
| ElGamal implementasyonu | 🟢 Düşük | Matematik basit, kütüphaneler var |
| Pedersen commitments | 🟢 Düşük | Aynı şekilde |
| Circom circuit | 🟡 Orta | Yeni dil, ama öğrenilebilir |
| Trusted setup | 🟢 Düşük | snarkjs otomatik yapıyor |
| Solidity kontratlar | 🟡 Orta | Standard Solidity |
| Client SDK | 🟡 Orta | snarkjs WASM entegrasyonu |
| Güvenlik | 🔴 Yüksek | Audit şart, hatalar kritik |

---

## Sonuç

**Evet, kendimiz yapabiliriz!**

- Teknolojiler açık ve erişilebilir
- Akademik makaleler yol gösteriyor
- Açık kaynak araçlar (Circom, snarkjs) hazır
- 6-8 hafta ile çalışan PoC mümkün

**Tek dikkat:** Güvenlik kritik, production için mutlaka audit gerekir.

---

## Kaynaklar

### Akademik
- [Bulletproofs Paper](https://eprint.iacr.org/2017/1066.pdf)
- [PGC: Confidential Payments](https://eprint.iacr.org/2019/319.pdf)
- [Pedersen Commitments Explained](https://www.nccgroup.com/research-blog/on-the-use-of-pedersen-commitments-for-confidential-payments/)

### Kod
- [Circom](https://github.com/iden3/circom) - GPL
- [snarkjs](https://github.com/iden3/snarkjs) - GPL
- [circomlib](https://github.com/iden3/circomlib) - GPL

### Tutorials
- [RareSkills Circom Tutorial](https://rareskills.io/post/circom-tutorial)
- [ZK Learning Resources](https://github.com/matter-labs/awesome-zero-knowledge-proofs)
