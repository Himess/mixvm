// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./libraries/PoseidonHasher.sol";
import "./interfaces/IMessageTransmitter.sol";

/**
 * @title PrivateCCTPDestination
 * @notice Private USDC Destination Contract for receiving Cross-Chain Transfers via CCTP
 *
 * This contract receives cross-chain private transfers:
 * 1. CCTP MessageTransmitter delivers message from source chain
 * 2. Contract decodes recipient commitment and stealth data
 * 3. Contract inserts commitment into local Merkle tree
 * 4. Recipient can now spend via ZK proof
 *
 * Features:
 * - Receives messages from authorized source contracts only
 * - Maintains local Merkle tree of commitments
 * - Creates stealth announcements for recipient scanning
 * - Records audit data for compliance
 */
contract PrivateCCTPDestination {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 10;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_LEAVES = 2 ** TREE_DEPTH;

    // ============ Structs ============
    struct Announcement {
        uint256 ephemeralPubKeyX;
        uint256 ephemeralPubKeyY;
        uint256 stealthAddressX;
        uint256 stealthAddressY;
        uint256 viewTag;
        bytes32 commitment;
        uint256 timestamp;
        uint32 sourceDomain;
    }

    struct AuditRecord {
        uint256[4] encryptedSender;
        uint256[4] encryptedRecipient;
        uint256[4] encryptedAmount;
        uint256 timestamp;
        uint32 sourceDomain;
    }

    struct CrossChainDeposit {
        bytes32 commitment;
        uint256 amount;
        uint32 sourceDomain;
        uint256 timestamp;
    }

    // ============ State ============
    PoseidonHasher public immutable poseidon;
    IMessageTransmitter public immutable messageTransmitter;

    // Merkle tree state
    bytes32 public merkleRoot;
    uint256 public nextLeafIndex;
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(bytes32 => bool) public commitmentExists;
    bytes32[11] public zeros;

    // Nullifiers
    mapping(bytes32 => bool) public usedNullifiers;

    // Announcements
    Announcement[] public announcements;
    mapping(uint256 => uint256[]) public announcementsByViewTag;

    // Cross-chain deposits
    CrossChainDeposit[] public deposits;

    // Audit records
    mapping(bytes32 => AuditRecord) public auditRecords;

    // Source contract authorization
    mapping(uint32 => bytes32) public authorizedSources;

    // Admin
    address public immutable admin;
    address public immutable auditor;

    // ============ Events ============
    event CrossChainDepositReceived(
        uint32 indexed sourceDomain,
        bytes32 indexed commitment,
        uint256 amount,
        uint256 leafIndex
    );

    event StealthPaymentAnnounced(
        uint256 indexed announcementIndex,
        uint256 ephemeralPubKeyX,
        uint256 stealthAddressX,
        uint256 viewTag,
        uint32 sourceDomain
    );

    event AuthorizedSourceSet(
        uint32 indexed domain,
        bytes32 sourceContract
    );

    // ============ Errors ============
    error UnauthorizedSource();
    error UnauthorizedCaller();
    error TreeFull();
    error CommitmentExists();
    error InvalidMessage();

    // ============ Constructor ============
    constructor(
        address _poseidon,
        address _messageTransmitter,
        address _admin,
        address _auditor
    ) {
        poseidon = PoseidonHasher(_poseidon);
        messageTransmitter = IMessageTransmitter(_messageTransmitter);
        admin = _admin;
        auditor = _auditor;

        _initMerkleTree();
    }

    // ============ Admin Functions ============

    /**
     * @notice Set authorized source contract for a domain
     * @param domain CCTP domain ID
     * @param sourceContract Address of PrivateCCTPSource on that domain
     */
    function setAuthorizedSource(uint32 domain, bytes32 sourceContract) external {
        require(msg.sender == admin, "Only admin");
        authorizedSources[domain] = sourceContract;
        emit AuthorizedSourceSet(domain, sourceContract);
    }

    // ============ Message Handler ============

    /**
     * @notice Handle incoming cross-chain message from CCTP
     * @dev Called by MessageTransmitter after receiving and verifying message
     *
     * @param sourceDomain Source chain domain ID
     * @param sender Sender contract address on source chain
     * @param messageBody Encoded message containing commitment and stealth data
     * @return success Whether message was handled successfully
     */
    function handleReceiveMessage(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody
    ) external returns (bool) {
        // 1. Verify caller is MessageTransmitter
        if (msg.sender != address(messageTransmitter)) revert UnauthorizedCaller();

        // 2. Verify sender is authorized source
        if (authorizedSources[sourceDomain] != sender) revert UnauthorizedSource();

        // 3. Decode message
        (
            bytes32 recipientCommitment,
            uint256 amount,
            uint256 ephemeralPubKeyX,
            uint256 ephemeralPubKeyY,
            uint256 stealthAddressX,
            uint256 stealthAddressY,
            uint256 viewTag,
            uint256[4] memory encryptedSender,
            uint256[4] memory encryptedRecipient,
            uint256[4] memory encryptedAmount
        ) = abi.decode(
            messageBody,
            (bytes32, uint256, uint256, uint256, uint256, uint256, uint256, uint256[4], uint256[4], uint256[4])
        );

        // 4. Insert commitment into Merkle tree
        uint256 leafIndex = _insertCommitment(recipientCommitment);

        // 5. Create stealth announcement
        uint256 announcementIndex = _createAnnouncement(
            ephemeralPubKeyX,
            ephemeralPubKeyY,
            stealthAddressX,
            stealthAddressY,
            viewTag,
            recipientCommitment,
            sourceDomain
        );

        // 6. Record audit data
        bytes32 txId = keccak256(abi.encodePacked(sourceDomain, sender, recipientCommitment, block.timestamp));
        auditRecords[txId] = AuditRecord({
            encryptedSender: encryptedSender,
            encryptedRecipient: encryptedRecipient,
            encryptedAmount: encryptedAmount,
            timestamp: block.timestamp,
            sourceDomain: sourceDomain
        });

        // 7. Store deposit record
        deposits.push(CrossChainDeposit({
            commitment: recipientCommitment,
            amount: amount,
            sourceDomain: sourceDomain,
            timestamp: block.timestamp
        }));

        emit CrossChainDepositReceived(
            sourceDomain,
            recipientCommitment,
            amount,
            leafIndex
        );

        return true;
    }

    // ============ Query Functions ============

    /**
     * @notice Get announcements by view tag
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
     * @notice Get total announcement count
     */
    function getAnnouncementCount() external view returns (uint256) {
        return announcements.length;
    }

    /**
     * @notice Get cross-chain deposit
     */
    function getDeposit(uint256 index) external view returns (CrossChainDeposit memory) {
        require(index < deposits.length, "Invalid index");
        return deposits[index];
    }

    /**
     * @notice Get total deposit count
     */
    function getDepositCount() external view returns (uint256) {
        return deposits.length;
    }

    /**
     * @notice Get current merkle root
     */
    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    /**
     * @notice Get audit record (auditor only)
     */
    function getAuditRecord(bytes32 txId) external view returns (AuditRecord memory) {
        require(msg.sender == auditor, "Only auditor");
        return auditRecords[txId];
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

    function _createAnnouncement(
        uint256 ephemeralPubKeyX,
        uint256 ephemeralPubKeyY,
        uint256 stealthAddressX,
        uint256 stealthAddressY,
        uint256 viewTag,
        bytes32 commitment,
        uint32 sourceDomain
    ) internal returns (uint256) {
        uint256 index = announcements.length;

        announcements.push(Announcement({
            ephemeralPubKeyX: ephemeralPubKeyX,
            ephemeralPubKeyY: ephemeralPubKeyY,
            stealthAddressX: stealthAddressX,
            stealthAddressY: stealthAddressY,
            viewTag: viewTag,
            commitment: commitment,
            timestamp: block.timestamp,
            sourceDomain: sourceDomain
        }));

        // Index by view tag for efficient scanning
        announcementsByViewTag[viewTag].push(index);

        emit StealthPaymentAnnounced(
            index,
            ephemeralPubKeyX,
            stealthAddressX,
            viewTag,
            sourceDomain
        );

        return index;
    }

    // ============ Receive ============
    receive() external payable {}
}
