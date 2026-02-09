// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Groth16Verifier.sol";

/**
 * @title PrivateUSDCv2
 * @notice Private USDC with Auditor Key for Compliance
 *
 * This contract extends PrivateUSDC with auditor capabilities:
 * - All transfers are encrypted for auditor review
 * - Auditor can decrypt transaction data using their private key
 * - Provides compliance while maintaining user privacy
 *
 * Privacy guarantees:
 * - Balances are hidden (stored as Poseidon commitments)
 * - Transfer amounts are hidden (only proved in ZK)
 * - Only the user knows their actual balance
 * - Only the auditor can decrypt transaction details
 */
contract PrivateUSDCv2 {
    // ============ State Variables ============

    /// @notice The ZK proof verifier contract
    Groth16Verifier public immutable verifier;

    /// @notice Encrypted balances stored as Poseidon commitments
    mapping(address => uint256) public balanceCommitments;

    /// @notice Nullifiers to prevent double-spending
    mapping(uint256 => bool) public usedNullifiers;

    /// @notice Total USDC deposited
    uint256 public totalDeposited;

    /// @notice User registration status
    mapping(address => bool) public isRegistered;

    // ============ Auditor System ============

    /// @notice Auditor public key (can decrypt all transactions)
    /// @dev Stored as BabyJubJub point (x, y)
    uint256[2] public auditorPublicKey;

    /// @notice Auditor address (can call audit functions)
    address public auditor;

    /// @notice Encrypted transaction data for auditor
    struct AuditRecord {
        uint256[4] encryptedSender;    // ElGamal ciphertext (C1x, C1y, C2x, C2y)
        uint256[4] encryptedRecipient; // ElGamal ciphertext
        uint256[4] encryptedAmount;    // ElGamal ciphertext
        uint256 timestamp;
        bool exists;
    }

    /// @notice Transaction hash => Audit record
    mapping(bytes32 => AuditRecord) public auditRecords;

    /// @notice All transaction hashes for iteration
    bytes32[] public transactionHashes;

    // ============ Events ============

    event Registered(address indexed user, uint256 initialCommitment);
    event Deposited(address indexed user, uint256 amount, uint256 newCommitment);
    event PrivateTransfer(
        address indexed sender,
        uint256 nullifier,
        uint256 newSenderCommitment,
        uint256 recipientCommitment
    );
    event Withdrawn(address indexed user, uint256 amount, uint256 newCommitment);
    event AuditRecordCreated(bytes32 indexed txHash, uint256 timestamp);
    event AuditorChanged(address indexed oldAuditor, address indexed newAuditor);

    // ============ Errors ============

    error NotRegistered();
    error AlreadyRegistered();
    error InvalidProof();
    error NullifierAlreadyUsed();
    error InsufficientContractBalance();
    error InvalidCommitment();
    error OnlyAuditor();
    error RecordNotFound();

    // ============ Modifiers ============

    modifier onlyAuditor() {
        if (msg.sender != auditor) revert OnlyAuditor();
        _;
    }

    // ============ Constructor ============

    constructor(
        address _verifier,
        address _auditor,
        uint256[2] memory _auditorPublicKey
    ) {
        verifier = Groth16Verifier(_verifier);
        auditor = _auditor;
        auditorPublicKey = _auditorPublicKey;
    }

    // ============ User Functions ============

    /**
     * @notice Register a new user with initial zero balance
     * @param initialCommitment Poseidon(0, randomness)
     */
    function register(uint256 initialCommitment) external {
        if (isRegistered[msg.sender]) revert AlreadyRegistered();
        if (initialCommitment == 0) revert InvalidCommitment();

        isRegistered[msg.sender] = true;
        balanceCommitments[msg.sender] = initialCommitment;

        emit Registered(msg.sender, initialCommitment);
    }

    /**
     * @notice Deposit USDC and update encrypted balance
     */
    function deposit(
        uint256 amount,
        uint256 newCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata publicSignals
    ) external payable {
        if (!isRegistered[msg.sender]) revert NotRegistered();
        if (msg.value != amount) revert InsufficientContractBalance();

        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        if (publicSignals[2] != newCommitment) {
            revert InvalidCommitment();
        }

        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        balanceCommitments[msg.sender] = newCommitment;
        totalDeposited += amount;

        emit Deposited(msg.sender, amount, newCommitment);
    }

    /**
     * @notice Perform a private transfer with audit data
     * @param nullifier Unique nullifier to prevent double-spend
     * @param newSenderCommitment Sender's new balance commitment
     * @param recipientCommitment Amount commitment for recipient
     * @param pA Proof element A
     * @param pB Proof element B
     * @param pC Proof element C
     * @param publicSignals Public signals
     * @param encryptedSender Encrypted sender data for auditor
     * @param encryptedRecipient Encrypted recipient data for auditor
     * @param encryptedAmount Encrypted amount for auditor
     */
    function privateTransferWithAudit(
        uint256 nullifier,
        uint256 newSenderCommitment,
        uint256 recipientCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata publicSignals,
        // Audit data (encrypted for auditor)
        uint256[4] calldata encryptedSender,
        uint256[4] calldata encryptedRecipient,
        uint256[4] calldata encryptedAmount
    ) external {
        // Verify user is registered
        if (!isRegistered[msg.sender]) revert NotRegistered();

        // Check nullifier hasn't been used
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();

        // Verify old commitment matches
        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        // Verify new commitment matches
        if (publicSignals[2] != newSenderCommitment) {
            revert InvalidCommitment();
        }

        // Verify the ZK proof
        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // Update sender's commitment
        balanceCommitments[msg.sender] = newSenderCommitment;

        // Create audit record
        bytes32 txHash = keccak256(abi.encodePacked(
            msg.sender,
            nullifier,
            block.timestamp,
            block.number
        ));

        auditRecords[txHash] = AuditRecord({
            encryptedSender: encryptedSender,
            encryptedRecipient: encryptedRecipient,
            encryptedAmount: encryptedAmount,
            timestamp: block.timestamp,
            exists: true
        });

        transactionHashes.push(txHash);

        emit PrivateTransfer(msg.sender, nullifier, newSenderCommitment, recipientCommitment);
        emit AuditRecordCreated(txHash, block.timestamp);
    }

    /**
     * @notice Legacy private transfer (no audit data)
     */
    function privateTransfer(
        uint256 nullifier,
        uint256 newSenderCommitment,
        uint256 recipientCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata publicSignals
    ) external {
        if (!isRegistered[msg.sender]) revert NotRegistered();
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();

        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        if (publicSignals[2] != newSenderCommitment) {
            revert InvalidCommitment();
        }

        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        usedNullifiers[nullifier] = true;
        balanceCommitments[msg.sender] = newSenderCommitment;

        emit PrivateTransfer(msg.sender, nullifier, newSenderCommitment, recipientCommitment);
    }

    /**
     * @notice Withdraw USDC from private balance
     */
    function withdraw(
        uint256 amount,
        uint256 newCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata publicSignals
    ) external {
        if (!isRegistered[msg.sender]) revert NotRegistered();

        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        if (publicSignals[2] != newCommitment) {
            revert InvalidCommitment();
        }

        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        if (address(this).balance < amount) {
            revert InsufficientContractBalance();
        }

        balanceCommitments[msg.sender] = newCommitment;
        totalDeposited -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount, newCommitment);
    }

    // ============ Auditor Functions ============

    /**
     * @notice Get audit record (only auditor)
     * @param txHash Transaction hash
     */
    function getAuditRecord(bytes32 txHash)
        external
        view
        onlyAuditor
        returns (AuditRecord memory)
    {
        if (!auditRecords[txHash].exists) revert RecordNotFound();
        return auditRecords[txHash];
    }

    /**
     * @notice Get all transaction hashes (only auditor)
     */
    function getAllTransactionHashes()
        external
        view
        onlyAuditor
        returns (bytes32[] memory)
    {
        return transactionHashes;
    }

    /**
     * @notice Get transaction count (only auditor)
     */
    function getTransactionCount()
        external
        view
        onlyAuditor
        returns (uint256)
    {
        return transactionHashes.length;
    }

    /**
     * @notice Get audit records in range (only auditor)
     * @param startIndex Start index
     * @param endIndex End index (exclusive)
     */
    function getAuditRecordsInRange(uint256 startIndex, uint256 endIndex)
        external
        view
        onlyAuditor
        returns (bytes32[] memory hashes, AuditRecord[] memory records)
    {
        require(endIndex > startIndex, "Invalid range");
        require(endIndex <= transactionHashes.length, "End index out of bounds");

        uint256 length = endIndex - startIndex;
        hashes = new bytes32[](length);
        records = new AuditRecord[](length);

        for (uint256 i = 0; i < length; i++) {
            bytes32 hash = transactionHashes[startIndex + i];
            hashes[i] = hash;
            records[i] = auditRecords[hash];
        }
    }

    /**
     * @notice Change auditor (only current auditor)
     * @param newAuditor New auditor address
     * @param newPubKey New auditor public key
     */
    function changeAuditor(address newAuditor, uint256[2] calldata newPubKey)
        external
        onlyAuditor
    {
        address oldAuditor = auditor;
        auditor = newAuditor;
        auditorPublicKey = newPubKey;
        emit AuditorChanged(oldAuditor, newAuditor);
    }

    // ============ View Functions ============

    /**
     * @notice Get user's balance commitment
     */
    function getBalanceCommitment(address user) external view returns (uint256) {
        return balanceCommitments[user];
    }

    /**
     * @notice Check if a nullifier has been used
     */
    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    /**
     * @notice Get auditor public key
     */
    function getAuditorPublicKey() external view returns (uint256[2] memory) {
        return auditorPublicKey;
    }

    // ============ Receive Function ============

    receive() external payable {}
}
