// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Groth16Verifier.sol";

/**
 * @title PrivateUSDCMerkle
 * @notice Private USDC with Merkle Tree for Enhanced Privacy
 *
 * This contract stores all balance commitments in a Merkle tree.
 * Users prove their commitment is in the tree without revealing which one.
 * This provides anonymity among all participants.
 */
contract PrivateUSDCMerkle {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 20;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ============ State ============
    Groth16Verifier public immutable verifier;

    // Merkle tree
    bytes32 public merkleRoot;
    uint256 public nextLeafIndex;
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(bytes32 => bool) public commitmentExists;

    // Zero hashes for each level (precomputed)
    bytes32[21] public zeros;

    // Nullifiers
    mapping(bytes32 => bool) public usedNullifiers;

    // Auditor
    address public auditor;
    uint256[2] public auditorPublicKey;

    // ============ Events ============
    event CommitmentInserted(bytes32 indexed commitment, uint256 leafIndex, bytes32 newRoot);
    event PrivateTransfer(bytes32 indexed nullifier, bytes32 newCommitment);
    event Deposit(address indexed sender, uint256 amount, bytes32 commitment);
    event Withdrawal(address indexed recipient, uint256 amount, bytes32 nullifier);

    // ============ Errors ============
    error CommitmentAlreadyExists();
    error TreeIsFull();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error InvalidAmount();
    error InsufficientBalance();
    error OnlyAuditor();

    // ============ Modifiers ============
    modifier onlyAuditor() {
        if (msg.sender != auditor) revert OnlyAuditor();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _verifier,
        address _auditor,
        uint256[2] memory _auditorPubKey
    ) {
        verifier = Groth16Verifier(_verifier);
        auditor = _auditor;
        auditorPublicKey = _auditorPubKey;

        // Initialize empty tree
        _initializeTree();
    }

    // ============ Merkle Tree Functions ============

    function _initializeTree() internal {
        // Pre-compute zero hashes for empty tree
        bytes32 currentZero = bytes32(0);
        zeros[0] = currentZero;

        for (uint256 i = 1; i <= TREE_DEPTH; i++) {
            currentZero = _hashPair(zeros[i-1], zeros[i-1]);
            zeros[i] = currentZero;
            filledSubtrees[i-1] = zeros[i-1];
        }

        merkleRoot = currentZero;
    }

    function _hashPair(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        // Poseidon hash simulation using keccak256
        // In production, use actual Poseidon precompile or library
        return keccak256(abi.encodePacked(left, right));
    }

    function _insert(bytes32 commitment) internal returns (uint256 index) {
        if (commitmentExists[commitment]) revert CommitmentAlreadyExists();

        index = nextLeafIndex;
        if (index >= 2**TREE_DEPTH) revert TreeIsFull();

        commitmentExists[commitment] = true;
        nextLeafIndex++;

        bytes32 currentHash = commitment;
        uint256 currentIndex = index;

        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            if (currentIndex % 2 == 0) {
                // Left child - update filled subtree
                filledSubtrees[i] = currentHash;
                currentHash = _hashPair(currentHash, zeros[i]);
            } else {
                // Right child - use filled subtree
                currentHash = _hashPair(filledSubtrees[i], currentHash);
            }
            currentIndex /= 2;
        }

        merkleRoot = currentHash;
        emit CommitmentInserted(commitment, index, merkleRoot);
    }

    // ============ User Functions ============

    /**
     * @notice Deposit USDC and create a commitment
     * @param commitment The balance commitment (Poseidon(amount, randomness))
     */
    function deposit(bytes32 commitment) external payable {
        if (msg.value == 0) revert InvalidAmount();

        _insert(commitment);
        emit Deposit(msg.sender, msg.value, commitment);
    }

    /**
     * @notice Private transfer using Merkle proof
     * @param nullifier Unique identifier to prevent double-spend
     * @param newCommitment New balance commitment for sender
     * @param pA Groth16 proof component A
     * @param pB Groth16 proof component B
     * @param pC Groth16 proof component C
     * @param publicSignals Public signals for the proof
     */
    function privateTransfer(
        bytes32 nullifier,
        bytes32 newCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata publicSignals
    ) external {
        // Check nullifier hasn't been used
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();

        // Verify the Merkle root in proof matches current root
        // publicSignals[0] = merkleRoot
        // publicSignals[1] = nullifier
        // publicSignals[2] = newBalanceCommitment
        // publicSignals[3] = recipientCommitment

        if (bytes32(publicSignals[0]) != merkleRoot) {
            revert InvalidProof();
        }

        if (bytes32(publicSignals[1]) != nullifier) {
            revert InvalidProof();
        }

        if (bytes32(publicSignals[2]) != newCommitment) {
            revert InvalidProof();
        }

        // Verify the ZK proof
        uint256[3] memory signals = [publicSignals[0], publicSignals[1], publicSignals[2]];
        if (!verifier.verifyProof(pA, pB, pC, signals)) {
            revert InvalidProof();
        }

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // Insert new commitment
        _insert(newCommitment);

        emit PrivateTransfer(nullifier, newCommitment);
    }

    /**
     * @notice Withdraw USDC by proving balance
     * @param amount Amount to withdraw
     * @param nullifier Unique identifier for the withdrawal
     * @param newCommitment New balance commitment after withdrawal
     * @param pA Groth16 proof component A
     * @param pB Groth16 proof component B
     * @param pC Groth16 proof component C
     * @param publicSignals Public signals for the proof
     */
    function withdraw(
        uint256 amount,
        bytes32 nullifier,
        bytes32 newCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata publicSignals
    ) external {
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();
        if (address(this).balance < amount) revert InsufficientBalance();

        // Verify proof (same structure as transfer)
        if (bytes32(publicSignals[0]) != merkleRoot) {
            revert InvalidProof();
        }

        if (bytes32(publicSignals[1]) != nullifier) {
            revert InvalidProof();
        }

        uint256[3] memory signals = [publicSignals[0], publicSignals[1], publicSignals[2]];
        if (!verifier.verifyProof(pA, pB, pC, signals)) {
            revert InvalidProof();
        }

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // Insert new commitment (remaining balance)
        if (newCommitment != bytes32(0)) {
            _insert(newCommitment);
        }

        // Transfer funds
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawal(msg.sender, amount, nullifier);
    }

    // ============ View Functions ============

    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    function getLeafCount() external view returns (uint256) {
        return nextLeafIndex;
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    function isCommitmentInTree(bytes32 commitment) external view returns (bool) {
        return commitmentExists[commitment];
    }

    function getZeroHash(uint256 level) external view returns (bytes32) {
        require(level <= TREE_DEPTH, "Invalid level");
        return zeros[level];
    }

    function getFilledSubtree(uint256 level) external view returns (bytes32) {
        require(level < TREE_DEPTH, "Invalid level");
        return filledSubtrees[level];
    }

    // ============ Receive Function ============
    receive() external payable {}
}
