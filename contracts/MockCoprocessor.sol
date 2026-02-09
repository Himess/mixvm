// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FheType} from "@fhevm/solidity/lib/FheType.sol";

/// @title Mock ACL - İzin yönetimi simülasyonu
contract MockACL {
    mapping(bytes32 => mapping(address => bool)) public permissions;
    mapping(bytes32 => bool) public transientAllowed;

    function allow(bytes32 handle, address account) external {
        permissions[handle][account] = true;
    }

    function allowTransient(bytes32 handle, address account) external {
        permissions[handle][account] = true;
        transientAllowed[handle] = true;
    }

    function isAllowed(bytes32 handle, address account) external view returns (bool) {
        return permissions[handle][account];
    }
}

/// @title Mock FHE Executor - FHE işlemlerini simüle eder
/// @notice Bu gerçek FHE değil, sadece işlemlerin çalışıp çalışmadığını test eder
contract MockFHEVMExecutor {
    uint256 private nonce;

    event FHEOperation(string operation, bytes32 result);

    /// @notice Mock verifyInput - gerçekte coprocessor'a gider
    function verifyInput(
        bytes32 inputHandle,
        address callerAddress,
        bytes memory inputProof,
        FheType inputType
    ) external returns (bytes32 result) {
        // Mock: sadece handle'ı döndür (gerçek FHE yapmıyor)
        nonce++;
        result = keccak256(abi.encodePacked(inputHandle, callerAddress, nonce));
        emit FHEOperation("verifyInput", result);
    }

    /// @notice Mock fheAdd
    function fheAdd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        // Mock: XOR + nonce ile pseudo-random sonuç
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheAdd", result);
    }

    /// @notice Mock fheSub
    function fheSub(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheSub", result);
    }

    /// @notice Mock fheMul
    function fheMul(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheMul", result);
    }

    /// @notice Mock fheDiv
    function fheDiv(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheDiv", result);
    }

    /// @notice Mock fheRem
    function fheRem(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheRem", result);
    }

    /// @notice Mock fheBitAnd
    function fheBitAnd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheBitAnd", result);
    }

    /// @notice Mock fheBitOr
    function fheBitOr(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheBitOr", result);
    }

    /// @notice Mock fheBitXor
    function fheBitXor(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheBitXor", result);
    }

    /// @notice Mock fheShl
    function fheShl(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheShl", result);
    }

    /// @notice Mock fheShr
    function fheShr(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheShr", result);
    }

    /// @notice Mock fheRotl
    function fheRotl(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheRotl", result);
    }

    /// @notice Mock fheRotr
    function fheRotr(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheRotr", result);
    }

    /// @notice Mock fheEq
    function fheEq(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheEq", result);
    }

    /// @notice Mock fheNe
    function fheNe(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheNe", result);
    }

    /// @notice Mock fheGe
    function fheGe(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheGe", result);
    }

    /// @notice Mock fheGt
    function fheGt(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheGt", result);
    }

    /// @notice Mock fheLe
    function fheLe(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheLe", result);
    }

    /// @notice Mock fheLt
    function fheLt(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheLt", result);
    }

    /// @notice Mock fheMin
    function fheMin(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheMin", result);
    }

    /// @notice Mock fheMax
    function fheMax(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(lhs, rhs, scalarByte, nonce));
        emit FHEOperation("fheMax", result);
    }

    /// @notice Mock fheNeg
    function fheNeg(bytes32 ct) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(ct, nonce));
        emit FHEOperation("fheNeg", result);
    }

    /// @notice Mock fheNot
    function fheNot(bytes32 ct) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(ct, nonce));
        emit FHEOperation("fheNot", result);
    }

    /// @notice Mock cast
    function cast(bytes32 ct, FheType toType) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(ct, uint8(toType), nonce));
        emit FHEOperation("cast", result);
    }

    /// @notice Mock trivialEncrypt
    function trivialEncrypt(uint256 pt, FheType toType) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(pt, uint8(toType), nonce));
        emit FHEOperation("trivialEncrypt", result);
    }

    /// @notice Mock fheSelect (ternary)
    function fheSelect(bytes32 control, bytes32 ifTrue, bytes32 ifFalse) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(control, ifTrue, ifFalse, nonce));
        emit FHEOperation("fheSelect", result);
    }

    /// @notice Mock fheRand
    function fheRand(FheType randType) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(uint8(randType), nonce, block.timestamp));
        emit FHEOperation("fheRand", result);
    }

    /// @notice Mock fheRandBounded
    function fheRandBounded(uint256 upperBound, FheType randType) external returns (bytes32 result) {
        nonce++;
        result = keccak256(abi.encodePacked(upperBound, uint8(randType), nonce, block.timestamp));
        emit FHEOperation("fheRandBounded", result);
    }
}

/// @title Mock KMS Verifier
contract MockKMSVerifier {
    function verifyDecryptionEIP712KMSSignatures(
        bytes32[] memory handlesList,
        bytes memory decryptedResult,
        bytes memory decryptionProof
    ) external returns (bool) {
        // Mock: her zaman true döndür
        return true;
    }
}
