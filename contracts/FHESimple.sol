// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {CoprocessorConfig} from "@fhevm/solidity/lib/Impl.sol";

/// @title En basit FHE test kontratı
contract FHESimple {
    euint32 public storedValue;
    address public aclAddr;
    address public coprocessorAddr;
    address public kmsAddr;
    bool public isConfigured;

    event ConfigSet(address acl, address coprocessor, address kms);
    event ValueSet(bytes32 value);
    event DebugInfo(string message);

    /// @notice Config ayarla
    function configure(
        address _acl,
        address _coprocessor,
        address _kms
    ) external {
        CoprocessorConfig memory config = CoprocessorConfig({
            ACLAddress: _acl,
            CoprocessorAddress: _coprocessor,
            KMSVerifierAddress: _kms
        });

        FHE.setCoprocessor(config);

        aclAddr = _acl;
        coprocessorAddr = _coprocessor;
        kmsAddr = _kms;
        isConfigured = true;

        emit ConfigSet(_acl, _coprocessor, _kms);
    }

    /// @notice Trivial encrypt ile değer oluştur (en basit test)
    /// @dev Bu Coprocessor'a trivialEncrypt çağrısı yapar
    function setValueTrivial(uint32 plainValue) external {
        require(isConfigured, "Not configured");
        emit DebugInfo("Starting trivial encrypt");

        // FHE.asEuint32 trivialEncrypt kullanıyor
        storedValue = FHE.asEuint32(plainValue);

        emit ValueSet(euint32.unwrap(storedValue));
        emit DebugInfo("Trivial encrypt completed");
    }

    /// @notice Şifreli değeri oku
    function getStoredValue() external view returns (bytes32) {
        return euint32.unwrap(storedValue);
    }

    /// @notice Test: İki plaintext değeri şifreli olarak topla
    function addPlainValues(uint32 a, uint32 b) external returns (bytes32) {
        require(isConfigured, "Not configured");

        euint32 encA = FHE.asEuint32(a);
        euint32 encB = FHE.asEuint32(b);
        euint32 result = FHE.add(encA, encB);

        storedValue = result;
        return euint32.unwrap(result);
    }

    /// @notice Sadece initialized kontrolü (hiç coprocessor çağırmaz)
    function testInitialized() external view returns (bool) {
        return FHE.isInitialized(storedValue);
    }
}
