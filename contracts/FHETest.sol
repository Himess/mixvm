// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test 1: Basit import testi
import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";

/// @title Arc Network FHE Test Kontratı
/// @notice Zama fhEVM'in Arc Network'te çalışıp çalışmadığını test eder
contract FHETest {
    // Şifreli değişken tanımı
    euint32 private encryptedValue;

    // Normal değişken (karşılaştırma için)
    uint32 public plainValue;

    /// @notice Şifreli değer döndür
    function getEncryptedValue() external view returns (euint32) {
        return encryptedValue;
    }

    /// @notice Şifreli değer ata
    function setEncrypted(externalEuint32 input, bytes calldata proof) external {
        euint32 value = FHE.fromExternal(input, proof);
        encryptedValue = value;

        // İzinleri ayarla
        FHE.allowThis(encryptedValue);
        FHE.allow(encryptedValue, msg.sender);
    }

    /// @notice İki şifreli değeri topla
    function addEncrypted(externalEuint32 a, bytes calldata proofA) external {
        euint32 valueA = FHE.fromExternal(a, proofA);
        encryptedValue = FHE.add(encryptedValue, valueA);

        FHE.allowThis(encryptedValue);
        FHE.allow(encryptedValue, msg.sender);
    }

    /// @notice Normal değer ata (baseline test)
    function setPlain(uint32 value) external {
        plainValue = value;
    }
}
