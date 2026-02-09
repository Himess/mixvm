// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PrivateTransferVerifier.sol";
import "./WithdrawVerifier.sol";
import "./libraries/PoseidonHasher.sol";
import "./interfaces/ITokenMessenger.sol";
import "./interfaces/IMessageTransmitter.sol";

/**
 * @title PrivateCCTPSource
 * @notice Private USDC Source Contract for Cross-Chain Transfers via Circle CCTP
 *
 * This contract enables private cross-chain transfers:
 * 1. User proves ownership of balance commitment via ZK proof
 * 2. Contract burns tokens via CCTP TokenMessenger
 * 3. Destination contract receives message and mints to privacy pool
 *
 * Features:
 * - ZK proof verification for balance ownership
 * - Integration with Circle CCTP for cross-chain transfers
 * - Stealth addresses for recipient privacy
 * - Auditor key for compliance
 */
contract PrivateCCTPSource {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 10;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_LEAVES = 2 ** TREE_DEPTH;

    // ============ Structs ============
    struct StealthMetaAddress {
        uint256 spendingPubKeyX;
        uint256 spendingPubKeyY;
        uint256 viewingPubKeyX;
        uint256 viewingPubKeyY;
    }

    struct StealthData {
        uint256 ephemeralPubKeyX;
        uint256 ephemeralPubKeyY;
        uint256 stealthAddressX;
        uint256 stealthAddressY;
        uint256 viewTag;
    }

    struct AuditData {
        uint256[4] encryptedSender;
        uint256[4] encryptedRecipient;
        uint256[4] encryptedAmount;
    }

    struct ProofData {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[4] publicSignals;
    }

    struct CrossChainTransfer {
        bytes32 recipientCommitment;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 destinationContract;
        StealthData stealthData;
        uint256 timestamp;
        bool completed;
    }

    // ============ State ============
    TransferVerifier public immutable verifier;
    PoseidonHasher public immutable poseidon;
    ITokenMessenger public immutable tokenMessenger;
    IMessageTransmitter public immutable messageTransmitter;
    address public immutable usdc;

    // Merkle tree state
    bytes32 public merkleRoot;
    uint256 public nextLeafIndex;
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(bytes32 => bool) public commitmentExists;
    bytes32[11] public zeros;

    // Nullifiers (prevents double-spend)
    mapping(bytes32 => bool) public usedNullifiers;

    // Cross-chain transfer tracking
    mapping(uint64 => CrossChainTransfer) public pendingTransfers;

    // Destination contract registry
    mapping(uint32 => bytes32) public destinationContracts;

    // Auditor
    address public immutable auditor;

    // ============ Events ============
    event CrossChainTransferInitiated(
        uint64 indexed nonce,
        uint32 indexed destinationDomain,
        bytes32 recipientCommitment,
        uint256 amount,
        bytes32 nullifier
    );

    event DestinationContractSet(
        uint32 indexed domain,
        bytes32 contractAddress
    );

    event Deposited(
        address indexed user,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 leafIndex
    );

    // ============ Errors ============
    error NullifierUsed();
    error InvalidProof();
    error InvalidMerkleRoot();
    error InvalidDestination();
    error InsufficientBalance();
    error TreeFull();
    error CommitmentExists();
    error ZeroAmount();
    error Unauthorized();

    // ============ Constructor ============
    constructor(
        address _verifier,
        address _poseidon,
        address _tokenMessenger,
        address _messageTransmitter,
        address _usdc,
        address _auditor
    ) {
        verifier = TransferVerifier(_verifier);
        poseidon = PoseidonHasher(_poseidon);
        tokenMessenger = ITokenMessenger(_tokenMessenger);
        messageTransmitter = IMessageTransmitter(_messageTransmitter);
        usdc = _usdc;
        auditor = _auditor;

        _initMerkleTree();
    }

    // ============ Admin Functions ============

    /**
     * @notice Set destination contract for a domain
     * @param domain CCTP domain ID
     * @param contractAddress Address of PrivateCCTPDestination on that domain
     */
    function setDestinationContract(uint32 domain, bytes32 contractAddress) external {
        require(msg.sender == auditor, "Only auditor");
        destinationContracts[domain] = contractAddress;
        emit DestinationContractSet(domain, contractAddress);
    }

    // ============ Deposit ============

    /**
     * @notice Deposit USDC and create balance commitment
     * @param commitment Balance commitment: Poseidon(balance, randomness)
     */
    function deposit(bytes32 commitment) external payable {
        if (msg.value == 0) revert ZeroAmount();

        uint256 leafIndex = _insertCommitment(commitment);

        emit Deposited(msg.sender, msg.value, commitment, leafIndex);
    }

    // ============ Cross-Chain Transfer ============

    /**
     * @notice Execute private cross-chain transfer via CCTP
     *
     * Flow:
     * 1. Verify ZK proof of balance ownership
     * 2. Mark nullifier as used
     * 3. Burn tokens via CCTP TokenMessenger
     * 4. Store pending transfer for tracking
     *
     * @param destinationDomain CCTP domain ID of destination chain
     * @param nullifier Hash of sender's secret + old commitment
     * @param newSenderCommitment Sender's new balance commitment (remaining)
     * @param recipientCommitment Recipient's balance commitment
     * @param amount Amount to transfer
     * @param stealthData Stealth address data for recipient
     * @param auditData Encrypted data for auditor
     * @param proof ZK proof of balance ownership
     * @return nonce CCTP message nonce
     */
    function privateTransferCrossChain(
        uint32 destinationDomain,
        bytes32 nullifier,
        bytes32 newSenderCommitment,
        bytes32 recipientCommitment,
        uint256 amount,
        StealthData calldata stealthData,
        AuditData calldata auditData,
        ProofData calldata proof
    ) external returns (uint64 nonce) {
        // 1. Validate destination
        bytes32 destContract = destinationContracts[destinationDomain];
        if (destContract == bytes32(0)) revert InvalidDestination();

        // 2. Check nullifier not used
        if (usedNullifiers[nullifier]) revert NullifierUsed();

        // 3. Verify merkle root in proof
        if (bytes32(proof.publicSignals[0]) != merkleRoot) revert InvalidMerkleRoot();

        // 4. Verify ZK proof
        if (!_verifyProof(proof)) revert InvalidProof();

        // 5. Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // 6. Insert sender's new commitment (remaining balance on source chain)
        if (newSenderCommitment != bytes32(0)) {
            _insertCommitment(newSenderCommitment);
        }

        // 7. Encode message for destination
        bytes memory messageBody = abi.encode(
            recipientCommitment,
            amount,
            stealthData.ephemeralPubKeyX,
            stealthData.ephemeralPubKeyY,
            stealthData.stealthAddressX,
            stealthData.stealthAddressY,
            stealthData.viewTag,
            auditData.encryptedSender,
            auditData.encryptedRecipient,
            auditData.encryptedAmount
        );

        // 8. Burn tokens and send via CCTP
        // Note: On Arc Network, native token is USDC, so we handle this differently
        // For this implementation, we assume USDC is already held by contract
        nonce = messageTransmitter.sendMessage(
            destinationDomain,
            destContract,
            bytes32(0),    // destinationCaller - allow any
            0,             // minFinalityThreshold
            messageBody
        );

        // 9. Store pending transfer
        pendingTransfers[nonce] = CrossChainTransfer({
            recipientCommitment: recipientCommitment,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationContract: destContract,
            stealthData: stealthData,
            timestamp: block.timestamp,
            completed: false
        });

        emit CrossChainTransferInitiated(
            nonce,
            destinationDomain,
            recipientCommitment,
            amount,
            nullifier
        );
    }

    // ============ Query Functions ============

    /**
     * @notice Get pending cross-chain transfer
     */
    function getPendingTransfer(uint64 nonce) external view returns (CrossChainTransfer memory) {
        return pendingTransfers[nonce];
    }

    /**
     * @notice Get current merkle root
     */
    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    /**
     * @notice Get destination contract for domain
     */
    function getDestinationContract(uint32 domain) external view returns (bytes32) {
        return destinationContracts[domain];
    }

    // ============ Internal Functions ============

    function _initMerkleTree() internal {
        bytes32 currentZero = bytes32(0);
        zeros[0] = currentZero;

        for (uint256 i = 1; i <= TREE_DEPTH; i++) {
            currentZero = _hashPair(zeros[i-1], zeros[i-1]);
            zeros[i] = currentZero;
            filledSubtrees[i-1] = zeros[i-1];
        }

        merkleRoot = currentZero;
    }

    function _hashPair(bytes32 left, bytes32 right) internal view returns (bytes32) {
        return bytes32(poseidon.hash2(uint256(left), uint256(right)));
    }

    function _insertCommitment(bytes32 commitment) internal returns (uint256) {
        if (commitmentExists[commitment]) revert CommitmentExists();
        if (nextLeafIndex >= MAX_LEAVES) revert TreeFull();

        uint256 leafIndex = nextLeafIndex;
        commitmentExists[commitment] = true;
        nextLeafIndex++;

        bytes32 currentHash = commitment;
        uint256 currentIndex = leafIndex;

        for (uint256 level = 0; level < TREE_DEPTH; level++) {
            if (currentIndex % 2 == 0) {
                filledSubtrees[level] = currentHash;
                currentHash = _hashPair(currentHash, zeros[level]);
            } else {
                currentHash = _hashPair(filledSubtrees[level], currentHash);
            }
            currentIndex /= 2;
        }

        merkleRoot = currentHash;
        return leafIndex;
    }

    function _verifyProof(ProofData calldata proof) internal view returns (bool) {
        return verifier.verifyProof(proof.pA, proof.pB, proof.pC, proof.publicSignals);
    }

    // ============ Receive ============
    receive() external payable {}
}
