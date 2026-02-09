// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {CoprocessorConfig} from "@fhevm/solidity/lib/Impl.sol";

/// @title FHE Debug Kontratı
/// @notice Coprocessor config durumunu görmek için
contract FHEDebug {
    // Custom Arc config
    CoprocessorConfig public arcConfig;
    bool public configSet;

    // Test değişkenleri
    euint32 private encryptedValue;

    /// @notice Arc için custom coprocessor ayarla
    /// @dev Bu fonksiyon mock coprocessor adresi ayarlamak için
    function setArcConfig(
        address aclAddress,
        address coprocessorAddress,
        address kmsVerifierAddress
    ) external {
        arcConfig = CoprocessorConfig({
            ACLAddress: aclAddress,
            CoprocessorAddress: coprocessorAddress,
            KMSVerifierAddress: kmsVerifierAddress
        });
        configSet = true;

        // FHE library'ye config'i set et
        FHE.setCoprocessor(arcConfig);
    }

    /// @notice Config'in set edilip edilmediğini kontrol et
    function isConfigured() external view returns (bool) {
        return configSet;
    }

    /// @notice Basit şifreli değer okuması
    function getEncryptedValue() external view returns (euint32) {
        return encryptedValue;
    }

    /// @notice Şifreli değer ayarla (config set edildikten sonra)
    function setEncrypted(externalEuint32 input, bytes calldata proof) external {
        require(configSet, "Config not set");
        euint32 value = FHE.fromExternal(input, proof);
        encryptedValue = value;
        FHE.allowThis(encryptedValue);
        FHE.allow(encryptedValue, msg.sender);
    }

    /// @notice FHE.add testi
    function addEncrypted(externalEuint32 a, bytes calldata proofA) external {
        require(configSet, "Config not set");
        euint32 valueA = FHE.fromExternal(a, proofA);
        encryptedValue = FHE.add(encryptedValue, valueA);
        FHE.allowThis(encryptedValue);
        FHE.allow(encryptedValue, msg.sender);
    }
}
