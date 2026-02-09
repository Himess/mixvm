// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PrivateTransferVerifier.sol";
import "./WithdrawVerifier.sol";
import "./libraries/PoseidonHasher.sol";

/**
 * @title PrivateUSDCComplete
 * @notice Complete Private USDC system with integrated stealth + merkle + auditor
 *
 * Features:
 * - Merkle tree for balance commitments
 * - Stealth addresses for recipient privacy
 * - Integrated announcements (transfer + announce in one tx)
 * - Auditor key for compliance
 * - Poseidon hash (TypeScript compatible)
 *
 * Single transaction flow:
 * 1. User calls privateTransfer()
 * 2. Contract verifies proof
 * 3. Contract nullifies old commitment
 * 4. Contract inserts new commitments
 * 5. Contract creates stealth announcement
 * 6. Contract records audit data
 */
contract PrivateUSDCComplete {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 10;  // Must match circuit levels
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_LEAVES = 2 ** TREE_DEPTH;  // 1024 leaves

    // ============ Structs ============
    struct StealthMetaAddress {
        uint256 spendingPubKeyX;
        uint256 spendingPubKeyY;
        uint256 viewingPubKeyX;
        uint256 viewingPubKeyY;
    }

    struct Announcement {
        uint256 ephemeralPubKeyX;
        uint256 ephemeralPubKeyY;
        uint256 stealthAddressX;
        uint256 stealthAddressY;
        uint256 viewTag;
        bytes32 commitment;
        uint256 timestamp;
        address sender;
    }

    struct AuditRecord {
        uint256[4] encryptedSender;
        uint256[4] encryptedRecipient;
        uint256[4] encryptedAmount;
        uint256 timestamp;
    }

    // Calldata structs for gas optimization
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

    // Withdraw proof has 5 public signals: merkleRoot, nullifier, withdrawAmount, newCommitment, recipientAddress
    struct WithdrawProofData {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[5] publicSignals;
    }

    // ============ State ============
    TransferVerifier public immutable verifier;  // Transfer verifier
    WithdrawVerifier public immutable withdrawVerifier;  // Withdraw verifier
    PoseidonHasher public immutable poseidon;

    // Merkle tree state
    bytes32 public merkleRoot;
    uint256 public nextLeafIndex;
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(bytes32 => bool) public commitmentExists;
    bytes32[11] public zeros;  // TREE_DEPTH + 1

    // Nullifiers (prevents double-spend)
    mapping(bytes32 => bool) public usedNullifiers;

    // Stealth registry
    mapping(address => StealthMetaAddress) public stealthAddresses;
    mapping(address => bool) public isRegistered;

    // Announcements (stealth payment notifications)
    Announcement[] public announcements;
    mapping(uint256 => uint256[]) public announcementsByViewTag;

    // Auditor (compliance)
    address public immutable auditor;
    uint256[2] public auditorPublicKey;
    mapping(bytes32 => AuditRecord) public auditRecords;

    // ============ Events ============
    event Registered(
        address indexed user,
        uint256 spendingKeyX,
        uint256 spendingKeyY,
        uint256 viewingKeyX,
        uint256 viewingKeyY
    );

    event Deposited(
        address indexed user,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 leafIndex
    );

    event PrivateTransferCompleted(
        bytes32 indexed nullifier,
        bytes32 newSenderCommitment,
        bytes32 recipientCommitment,
        uint256 announcementIndex,
        bytes32 indexed merkleRoot
    );

    event StealthPaymentAnnounced(
        uint256 indexed announcementIndex,
        uint256 ephemeralPubKeyX,
        uint256 stealthAddressX,
        uint256 viewTag
    );

    event Withdrawn(
        address indexed user,
        uint256 amount,
        bytes32 nullifier
    );

    // ============ Errors ============
    error AlreadyRegistered();
    error NotRegistered();
    error NullifierUsed();
    error InvalidProof();
    error InvalidMerkleRoot();
    error InsufficientBalance();
    error TreeFull();
    error CommitmentExists();
    error InvalidPublicKey();
    error ZeroAmount();
    error InvalidRecipient();
    error NullifierMismatch();
    error AmountMismatch();
    error CommitmentMismatch();
    error RecipientMismatch();
    error TransferFailed();

    // ============ Constructor ============
    constructor(
        address _verifier,
        address _withdrawVerifier,
        address _poseidon,
        address _auditor,
        uint256[2] memory _auditorPubKey
    ) {
        verifier = TransferVerifier(_verifier);
        withdrawVerifier = WithdrawVerifier(_withdrawVerifier);
        poseidon = PoseidonHasher(_poseidon);
        auditor = _auditor;
        auditorPublicKey = _auditorPubKey;

        _initMerkleTree();
    }

    // ============ Registration ============

    /**
     * @notice Register for private transfers
     * @dev Creates stealth meta-address and initial zero-balance commitment
     * @param spendingPubKeyX X coordinate of spending public key (BabyJubJub)
     * @param spendingPubKeyY Y coordinate of spending public key
     * @param viewingPubKeyX X coordinate of viewing public key
     * @param viewingPubKeyY Y coordinate of viewing public key
     * @param initialCommitment Commitment to initial balance (typically 0)
     */
    function register(
        uint256 spendingPubKeyX,
        uint256 spendingPubKeyY,
        uint256 viewingPubKeyX,
        uint256 viewingPubKeyY,
        bytes32 initialCommitment
    ) external {
        if (isRegistered[msg.sender]) revert AlreadyRegistered();
        if (spendingPubKeyX == 0 && spendingPubKeyY == 0) revert InvalidPublicKey();
        if (viewingPubKeyX == 0 && viewingPubKeyY == 0) revert InvalidPublicKey();

        stealthAddresses[msg.sender] = StealthMetaAddress({
            spendingPubKeyX: spendingPubKeyX,
            spendingPubKeyY: spendingPubKeyY,
            viewingPubKeyX: viewingPubKeyX,
            viewingPubKeyY: viewingPubKeyY
        });

        isRegistered[msg.sender] = true;

        // Insert initial commitment into Merkle tree
        _insertCommitment(initialCommitment);

        emit Registered(
            msg.sender,
            spendingPubKeyX,
            spendingPubKeyY,
            viewingPubKeyX,
            viewingPubKeyY
        );
    }

    // ============ Deposit ============

    /**
     * @notice Deposit native token and create balance commitment
     * @dev On Arc Network, native token is USDC
     * @param commitment New balance commitment: Poseidon(newBalance, randomness)
     */
    function deposit(bytes32 commitment) external payable {
        if (msg.value == 0) revert ZeroAmount();

        uint256 leafIndex = _insertCommitment(commitment);

        emit Deposited(msg.sender, msg.value, commitment, leafIndex);
    }

    // ============ Private Transfer (INTEGRATED) ============

    /**
     * @notice Execute private transfer with integrated stealth announcement
     *
     * This single transaction:
     * 1. Verifies ZK proof of balance and transfer validity
     * 2. Nullifies sender's old commitment (prevents double-spend)
     * 3. Inserts sender's new commitment (remaining balance)
     * 4. Inserts recipient's commitment (received amount)
     * 5. Creates stealth announcement (recipient can scan)
     * 6. Records encrypted audit data
     *
     * @param nullifier Hash of sender's secret + old commitment
     * @param newSenderCommitment Sender's new balance commitment
     * @param recipientCommitment Recipient's balance commitment
     * @param stealthData Stealth address data for recipient scanning
     * @param auditData Encrypted data for auditor (sender, recipient, amount)
     * @param proof ZK proof verifying the transfer
     */
    function privateTransfer(
        bytes32 nullifier,
        bytes32 newSenderCommitment,
        bytes32 recipientCommitment,
        StealthData calldata stealthData,
        AuditData calldata auditData,
        ProofData calldata proof
    ) external {
        // 1. Check nullifier not used
        if (usedNullifiers[nullifier]) revert NullifierUsed();

        // 2. Verify merkle root in proof matches current root
        if (bytes32(proof.publicSignals[0]) != merkleRoot) revert InvalidMerkleRoot();

        // 3. Verify ZK proof
        if (!_verifyProof(proof)) revert InvalidProof();

        // 4. Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // 5. Insert new commitments
        _insertCommitment(newSenderCommitment);
        _insertCommitment(recipientCommitment);

        // 6. Create stealth announcement
        uint256 announcementIndex = _createAnnouncement(stealthData, recipientCommitment);

        // 7. Record audit data
        _recordAuditData(nullifier, auditData);

        emit PrivateTransferCompleted(
            nullifier,
            newSenderCommitment,
            recipientCommitment,
            announcementIndex,
            merkleRoot
        );
    }

    // ============ Withdrawal ============

    /**
     * @notice Withdraw from private balance to public address
     * @dev Validates ZK proof with 5 public signals:
     *      [0] merkleRoot, [1] nullifier, [2] withdrawAmount, [3] newCommitment, [4] recipientAddress
     *
     * @param amount Amount to withdraw
     * @param nullifier Nullifier for the commitment being spent
     * @param newCommitment New commitment for remaining balance (or bytes32(0) if full withdrawal)
     * @param recipient Address to receive the withdrawal
     * @param proof ZK proof of balance ownership and withdrawal validity
     */
    function withdraw(
        uint256 amount,
        bytes32 nullifier,
        bytes32 newCommitment,
        address recipient,
        WithdrawProofData calldata proof
    ) external {
        // 1. Check nullifier not used
        if (usedNullifiers[nullifier]) revert NullifierUsed();

        // 2. Check contract has enough balance
        if (address(this).balance < amount) revert InsufficientBalance();

        // 3. Check recipient is not zero
        if (recipient == address(0)) revert InvalidRecipient();

        // 4. Verify merkle root in proof matches current root
        if (bytes32(proof.publicSignals[0]) != merkleRoot) revert InvalidMerkleRoot();

        // 5. Verify public signals match provided parameters
        if (proof.publicSignals[1] != uint256(nullifier)) revert NullifierMismatch();
        if (proof.publicSignals[2] != amount) revert AmountMismatch();
        if (proof.publicSignals[3] != uint256(newCommitment)) revert CommitmentMismatch();
        if (proof.publicSignals[4] != uint256(uint160(recipient))) revert RecipientMismatch();

        // 6. Verify ZK proof
        if (!_verifyWithdrawProof(proof)) revert InvalidProof();

        // 7. Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // 8. If there's remaining balance, insert new commitment
        if (newCommitment != bytes32(0)) {
            _insertCommitment(newCommitment);
        }

        // 9. Transfer to recipient
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(recipient, amount, nullifier);
    }

    // ============ Query Functions ============

    /**
     * @notice Get announcements by view tag for fast scanning
     */
    function getAnnouncementsByViewTag(uint256 viewTag) external view returns (uint256[] memory) {
        return announcementsByViewTag[viewTag];
    }

    /**
     * @notice Get single announcement
     */
    function getAnnouncement(uint256 index) external view returns (Announcement memory) {
        require(index < announcements.length, "Invalid index");
        return announcements[index];
    }

    /**
     * @notice Get announcements in range
     */
    function getAnnouncementsRange(uint256 start, uint256 end)
        external view returns (Announcement[] memory result)
    {
        if (end > announcements.length) end = announcements.length;
        if (start >= end) return new Announcement[](0);

        result = new Announcement[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = announcements[i];
        }
    }

    /**
     * @notice Get total announcement count
     */
    function getAnnouncementCount() external view returns (uint256) {
        return announcements.length;
    }

    /**
     * @notice Get stealth meta-address for a user
     */
    function getStealthAddress(address user) external view returns (StealthMetaAddress memory) {
        if (!isRegistered[user]) revert NotRegistered();
        return stealthAddresses[user];
    }

    /**
     * @notice Check if address is registered
     */
    function isUserRegistered(address user) external view returns (bool) {
        return isRegistered[user];
    }

    /**
     * @notice Get current Merkle root
     */
    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    /**
     * @notice Get current leaf count
     */
    function getLeafCount() external view returns (uint256) {
        return nextLeafIndex;
    }

    /**
     * @notice Check if commitment exists
     */
    function commitmentIncluded(bytes32 commitment) external view returns (bool) {
        return commitmentExists[commitment];
    }

    /**
     * @notice Check if nullifier is used
     */
    function nullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    // ============ Auditor Functions ============

    /**
     * @notice Get audit record for a transaction (auditor only)
     */
    function getAuditRecord(bytes32 txId) external view returns (AuditRecord memory) {
        require(msg.sender == auditor, "Only auditor");
        return auditRecords[txId];
    }

    /**
     * @notice Get auditor public key
     */
    function getAuditorPublicKey() external view returns (uint256[2] memory) {
        return auditorPublicKey;
    }

    // ============ Internal Functions ============

    /**
     * @notice Initialize Merkle tree with zero values
     */
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

    /**
     * @notice Hash two values using Poseidon
     */
    function _hashPair(bytes32 left, bytes32 right) internal view returns (bytes32) {
        return bytes32(poseidon.hash2(uint256(left), uint256(right)));
    }

    /**
     * @notice Insert commitment into Merkle tree
     */
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
                // Left child - save for later and hash with zero
                filledSubtrees[level] = currentHash;
                currentHash = _hashPair(currentHash, zeros[level]);
            } else {
                // Right child - hash with saved left sibling
                currentHash = _hashPair(filledSubtrees[level], currentHash);
            }
            currentIndex /= 2;
        }

        merkleRoot = currentHash;
        return leafIndex;
    }

    /**
     * @notice Create stealth payment announcement
     */
    function _createAnnouncement(StealthData calldata data, bytes32 commitment)
        internal returns (uint256)
    {
        uint256 index = announcements.length;

        announcements.push(Announcement({
            ephemeralPubKeyX: data.ephemeralPubKeyX,
            ephemeralPubKeyY: data.ephemeralPubKeyY,
            stealthAddressX: data.stealthAddressX,
            stealthAddressY: data.stealthAddressY,
            viewTag: data.viewTag,
            commitment: commitment,
            timestamp: block.timestamp,
            sender: msg.sender
        }));

        // Index by view tag for efficient scanning
        announcementsByViewTag[data.viewTag].push(index);

        emit StealthPaymentAnnounced(
            index,
            data.ephemeralPubKeyX,
            data.stealthAddressX,
            data.viewTag
        );

        return index;
    }

    /**
     * @notice Record encrypted audit data
     */
    function _recordAuditData(bytes32 txId, AuditData calldata data) internal {
        auditRecords[txId] = AuditRecord({
            encryptedSender: data.encryptedSender,
            encryptedRecipient: data.encryptedRecipient,
            encryptedAmount: data.encryptedAmount,
            timestamp: block.timestamp
        });
    }

    /**
     * @notice Verify ZK proof for transfers
     */
    function _verifyProof(ProofData calldata proof) internal view returns (bool) {
        // Pass all 4 public signals to verifier
        // [0] merkleRoot, [1] nullifier, [2] newSenderCommitment, [3] recipientCommitment
        return verifier.verifyProof(proof.pA, proof.pB, proof.pC, proof.publicSignals);
    }

    /**
     * @notice Verify ZK proof for withdrawals
     */
    function _verifyWithdrawProof(WithdrawProofData calldata proof) internal view returns (bool) {
        // Pass all 5 public signals to withdraw verifier
        // [0] merkleRoot, [1] nullifier, [2] withdrawAmount, [3] newCommitment, [4] recipientAddress
        return withdrawVerifier.verifyProof(proof.pA, proof.pB, proof.pC, proof.publicSignals);
    }

    // ============ Receive ============
    receive() external payable {}
}
