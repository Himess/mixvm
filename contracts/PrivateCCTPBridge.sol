// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PrivateTransferVerifier.sol";
import "./WithdrawVerifier.sol";
import "./libraries/PoseidonHasher.sol";
import "./interfaces/ITokenMessenger.sol";
import "./interfaces/IMessageTransmitter.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title PrivateCCTPBridge
 * @notice Unified bidirectional cross-chain private transfer contract using Circle CCTP V2
 *
 * CCTP Integration Architecture:
 * - Uses TokenMessenger.depositForBurn() for USDC cross-chain transfers (NOT MessageTransmitter.sendMessage)
 * - Privacy metadata sent via separate message channel
 * - Two-phase receive: USDC via CCTP, metadata via message handler
 *
 * Deploy on each supported chain (Arc, Base Sepolia, Ethereum Sepolia) and cross-register.
 *
 * Features:
 * - Native USDC deposits (Arc) and ERC20 USDC deposits (Base/Ethereum)
 * - ZK proof verification for balance ownership and transfers
 * - Cross-chain transfers via Circle CCTP V2
 * - Stealth addresses for recipient privacy
 * - Local same-chain private transfers
 * - Withdrawals with ZK proofs
 *
 * Supported 6 Routes:
 * - Arc <-> Base Sepolia (2 routes)
 * - Arc <-> Ethereum Sepolia (2 routes)
 * - Base Sepolia <-> Ethereum Sepolia (2 routes)
 *
 * CCTP Domain IDs:
 * - Ethereum Mainnet/Sepolia: 0
 * - Base: 6
 * - Arc: 26
 */
contract PrivateCCTPBridge {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 10;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_LEAVES = 2 ** TREE_DEPTH;

    // ============ Structs ============
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

    struct WithdrawProofData {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[5] publicSignals; // [root, nullifier, recipient, amount, newCommitment]
    }

    struct CrossChainTransfer {
        bytes32 recipientCommitment;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 destinationContract;
        StealthData stealthData;
        uint256 timestamp;
        bool completed;
        uint64 burnNonce;      // CCTP burn nonce
        uint64 metadataNonce;  // Metadata message nonce
    }

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

    /// @notice Pending cross-chain deposit waiting for USDC mint
    struct PendingDeposit {
        bytes32 recipientCommitment;
        uint256 amount;
        StealthData stealthData;
        AuditData auditData;
        uint32 sourceDomain;
        uint256 timestamp;
        bool metadataReceived;
        bool usdcReceived;
    }

    // ============ Immutables ============
    TransferVerifier public immutable transferVerifier;
    WithdrawVerifier public immutable withdrawVerifier;
    PoseidonHasher public immutable poseidon;
    ITokenMessenger public immutable tokenMessenger;
    IMessageTransmitter public immutable messageTransmitter;

    /// @notice USDC token address (address(0) for Arc native USDC)
    address public immutable usdc;

    /// @notice Whether this chain uses native USDC (Arc) or ERC20 USDC
    bool public immutable isNativeUSDC;

    /// @notice Local CCTP domain ID
    uint32 public immutable localDomain;

    /// @notice Admin address
    address public immutable admin;

    // ============ Merkle Tree State ============
    bytes32 public merkleRoot;
    uint256 public nextLeafIndex;
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(bytes32 => bool) public commitmentExists;
    bytes32[11] public zeros;

    // ============ Nullifiers ============
    mapping(bytes32 => bool) public usedNullifiers;

    // ============ Cross-Chain Registry ============
    /// @notice Destination contracts for outgoing transfers (domain => contract)
    mapping(uint32 => bytes32) public destinationContracts;

    /// @notice Authorized source contracts for incoming transfers (domain => contract)
    mapping(uint32 => bytes32) public authorizedSources;

    /// @notice USDC addresses on each domain (domain => USDC address as bytes32)
    mapping(uint32 => bytes32) public domainUSDC;

    // ============ Cross-Chain Transfer Tracking ============
    mapping(uint64 => CrossChainTransfer) public pendingTransfers;

    /// @notice Track pending deposits by commitment hash
    mapping(bytes32 => PendingDeposit) public pendingDeposits;

    // ============ Stealth Announcements ============
    Announcement[] public announcements;
    mapping(uint256 => uint256[]) public announcementsByViewTag;

    // ============ Audit Records ============
    mapping(bytes32 => AuditRecord) public auditRecords;

    // ============ Events ============
    event Deposited(
        address indexed user,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 leafIndex
    );

    event PrivateTransferExecuted(
        bytes32 indexed nullifier,
        bytes32 newSenderCommitment,
        bytes32 recipientCommitment,
        uint256 leafIndex
    );

    event CrossChainTransferInitiated(
        uint64 indexed burnNonce,
        uint64 indexed metadataNonce,
        uint32 indexed destinationDomain,
        bytes32 recipientCommitment,
        uint256 amount,
        bytes32 nullifier,
        bytes32 newSenderCommitment,
        uint256 senderLeafIndex
    );

    event CrossChainDepositReceived(
        uint32 indexed sourceDomain,
        bytes32 indexed commitment,
        uint256 amount,
        uint256 leafIndex
    );

    event NativeUSDCLocked(
        uint256 amount,
        uint32 indexed destinationDomain,
        bytes32 destinationContract
    );

    event CrossChainMetadataEmitted(
        uint64 indexed nonce,
        uint32 indexed destinationDomain,
        bytes32 destinationContract,
        bytes32 recipientCommitment,
        uint256 amount,
        StealthData stealthData,
        AuditData auditData
    );

    event CrossChainMetadataReceived(
        uint32 indexed sourceDomain,
        bytes32 indexed commitment,
        uint256 amount
    );

    event CrossChainUSDCReceived(
        bytes32 indexed commitment,
        uint256 amount
    );

    event StealthPaymentAnnounced(
        uint256 indexed announcementIndex,
        uint256 ephemeralPubKeyX,
        uint256 stealthAddressX,
        uint256 viewTag,
        uint32 sourceDomain
    );

    event Withdrawn(
        address indexed recipient,
        uint256 amount,
        bytes32 nullifier,
        bytes32 newCommitment,
        uint256 newLeafIndex
    );

    event DestinationContractSet(uint32 indexed domain, bytes32 contractAddress);
    event AuthorizedSourceSet(uint32 indexed domain, bytes32 sourceContract);
    event DomainUSDCSet(uint32 indexed domain, bytes32 usdcAddress);

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
    error UnauthorizedSource();
    error UnauthorizedCaller();
    error InvalidMessage();
    error TransferFailed();
    error ApprovalFailed();
    error DepositNotFound();
    error AlreadyProcessed();

    // ============ Constructor ============
    constructor(
        address _transferVerifier,
        address _withdrawVerifier,
        address _poseidon,
        address _tokenMessenger,
        address _messageTransmitter,
        address _usdc,
        bool _isNativeUSDC,
        uint32 _localDomain,
        address _admin
    ) {
        transferVerifier = TransferVerifier(_transferVerifier);
        withdrawVerifier = WithdrawVerifier(_withdrawVerifier);
        poseidon = PoseidonHasher(_poseidon);
        tokenMessenger = ITokenMessenger(_tokenMessenger);
        messageTransmitter = IMessageTransmitter(_messageTransmitter);
        usdc = _usdc;
        isNativeUSDC = _isNativeUSDC;
        localDomain = _localDomain;
        admin = _admin;

        _initMerkleTree();
    }

    // ============ Modifiers ============
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // ============ Admin Functions ============

    /**
     * @notice Set destination contract for a CCTP domain
     * @param domain CCTP domain ID (26=Arc, 6=Base, 0=Ethereum)
     * @param contractAddress Bytes32 encoded address of PrivateCCTPBridge on that domain
     */
    function setDestinationContract(uint32 domain, bytes32 contractAddress) external onlyAdmin {
        destinationContracts[domain] = contractAddress;
        emit DestinationContractSet(domain, contractAddress);
    }

    /**
     * @notice Set authorized source contract for a CCTP domain
     * @param domain CCTP domain ID
     * @param sourceContract Bytes32 encoded address of authorized PrivateCCTPBridge
     */
    function setAuthorizedSource(uint32 domain, bytes32 sourceContract) external onlyAdmin {
        authorizedSources[domain] = sourceContract;
        emit AuthorizedSourceSet(domain, sourceContract);
    }

    /**
     * @notice Set USDC address for a domain
     * @param domain CCTP domain ID
     * @param usdcAddress USDC token address on that domain (bytes32 encoded)
     */
    function setDomainUSDC(uint32 domain, bytes32 usdcAddress) external onlyAdmin {
        domainUSDC[domain] = usdcAddress;
        emit DomainUSDCSet(domain, usdcAddress);
    }

    // ============ Deposit Functions ============

    /**
     * @notice Deposit native USDC (for Arc Network)
     * @param commitment Balance commitment: Poseidon(balance, randomness)
     */
    function deposit(bytes32 commitment) external payable {
        if (!isNativeUSDC) revert Unauthorized();
        if (msg.value == 0) revert ZeroAmount();

        uint256 leafIndex = _insertCommitment(commitment);

        emit Deposited(msg.sender, msg.value, commitment, leafIndex);
    }

    /**
     * @notice Deposit ERC20 USDC (for Base Sepolia, Ethereum Sepolia)
     * @param commitment Balance commitment: Poseidon(balance, randomness)
     * @param amount Amount of USDC to deposit (6 decimals)
     */
    function depositUSDC(bytes32 commitment, uint256 amount) external {
        if (isNativeUSDC) revert Unauthorized();
        if (amount == 0) revert ZeroAmount();

        // Transfer USDC from user
        bool success = IERC20(usdc).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        uint256 leafIndex = _insertCommitment(commitment);

        emit Deposited(msg.sender, amount, commitment, leafIndex);
    }

    // ============ Same-Chain Private Transfer ============

    /**
     * @notice Execute a same-chain private transfer
     * @param nullifier Hash of sender's secret + old commitment (prevents double-spend)
     * @param newSenderCommitment Sender's new balance commitment (remaining)
     * @param recipientCommitment Recipient's balance commitment
     * @param stealthData Stealth address data for recipient
     * @param proof ZK proof of balance ownership
     */
    function privateTransfer(
        bytes32 nullifier,
        bytes32 newSenderCommitment,
        bytes32 recipientCommitment,
        StealthData calldata stealthData,
        ProofData calldata proof
    ) external {
        // 1. Check nullifier not used
        if (usedNullifiers[nullifier]) revert NullifierUsed();

        // 2. Verify merkle root in proof
        if (bytes32(proof.publicSignals[0]) != merkleRoot) revert InvalidMerkleRoot();

        // 3. Verify ZK proof
        if (!_verifyTransferProof(proof)) revert InvalidProof();

        // 4. Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // 5. Insert sender's new commitment
        uint256 senderLeafIndex;
        if (newSenderCommitment != bytes32(0)) {
            senderLeafIndex = _insertCommitment(newSenderCommitment);
        }

        // 6. Insert recipient's commitment
        uint256 recipientLeafIndex = _insertCommitment(recipientCommitment);

        // 7. Create stealth announcement for recipient
        _createAnnouncement(
            stealthData.ephemeralPubKeyX,
            stealthData.ephemeralPubKeyY,
            stealthData.stealthAddressX,
            stealthData.stealthAddressY,
            stealthData.viewTag,
            recipientCommitment,
            localDomain
        );

        emit PrivateTransferExecuted(
            nullifier,
            newSenderCommitment,
            recipientCommitment,
            recipientLeafIndex
        );
    }

    // ============ Cross-Chain Transfer (Outgoing) ============

    /**
     * @notice Execute private cross-chain transfer via CCTP V2
     *
     * CCTP V2 Integration Flow:
     * 1. Verify ZK proof of balance ownership
     * 2. Mark nullifier as used (prevents double-spend)
     * 3. For ERC20 USDC: Approve TokenMessenger and call depositForBurn()
     * 4. For Native USDC (Arc): Handle native token burning
     * 5. Send privacy metadata via MessageTransmitter.sendMessage()
     * 6. Relayer picks up MessageSent events and calls receiveMessage on destination
     *
     * @param destinationDomain CCTP domain ID of destination chain
     * @param nullifier Hash of sender's secret + old commitment
     * @param newSenderCommitment Sender's new balance commitment (remaining on source)
     * @param recipientCommitment Recipient's balance commitment (on destination)
     * @param amount Amount to transfer
     * @param stealthData Stealth address data for recipient
     * @param auditData Encrypted data for compliance
     * @param proof ZK proof of balance ownership
     * @return burnNonce CCTP token burn nonce
     * @return metadataNonce Privacy metadata message nonce
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
    ) external returns (uint64 burnNonce, uint64 metadataNonce) {
        // 1. Validate destination
        bytes32 destContract = destinationContracts[destinationDomain];
        if (destContract == bytes32(0)) revert InvalidDestination();

        // 2. Check nullifier not used
        if (usedNullifiers[nullifier]) revert NullifierUsed();

        // 3. Verify merkle root in proof
        if (bytes32(proof.publicSignals[0]) != merkleRoot) revert InvalidMerkleRoot();

        // 4. Verify ZK proof
        if (!_verifyTransferProof(proof)) revert InvalidProof();

        // 5. Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // 6. Insert sender's new commitment (remaining balance on source chain)
        uint256 senderLeafIndex = type(uint256).max; // Max value means no commitment inserted
        if (newSenderCommitment != bytes32(0)) {
            senderLeafIndex = _insertCommitment(newSenderCommitment);
        }

        // 7. Execute CCTP token burn
        if (isNativeUSDC) {
            // Arc: Native USDC - need special handling
            // For Arc, we may need to wrap to ERC20 first or use different mechanism
            // This depends on how Arc implements native USDC bridging
            burnNonce = _burnNativeUSDC(destinationDomain, destContract, amount);
        } else {
            // Base/Ethereum: Standard ERC20 USDC via CCTP
            burnNonce = _burnERC20USDC(destinationDomain, destContract, amount);
        }

        // 8. Send privacy metadata via event
        // CCTP V2 MessageTransmitter.sendMessage has access controls that may block direct calls
        // Instead, emit event for relayer-based metadata bridging (works for all chains)
        metadataNonce = burnNonce; // Use burn nonce as metadata correlation ID

        emit CrossChainMetadataEmitted(
            burnNonce,
            destinationDomain,
            destContract,
            recipientCommitment,
            amount,
            stealthData,
            auditData
        );

        // 9. Store pending transfer for tracking
        pendingTransfers[burnNonce] = CrossChainTransfer({
            recipientCommitment: recipientCommitment,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationContract: destContract,
            stealthData: stealthData,
            timestamp: block.timestamp,
            completed: false,
            burnNonce: burnNonce,
            metadataNonce: metadataNonce
        });

        emit CrossChainTransferInitiated(
            burnNonce,
            metadataNonce,
            destinationDomain,
            recipientCommitment,
            amount,
            nullifier,
            newSenderCommitment,
            senderLeafIndex
        );
    }

    /**
     * @notice Burn ERC20 USDC via CCTP TokenMessenger
     */
    function _burnERC20USDC(
        uint32 destinationDomain,
        bytes32 destContract,
        uint256 amount
    ) internal returns (uint64 nonce) {
        // Check contract has enough USDC (from user deposits)
        if (IERC20(usdc).balanceOf(address(this)) < amount) revert InsufficientBalance();

        // Approve TokenMessenger to spend USDC
        uint256 currentAllowance = IERC20(usdc).allowance(address(this), address(tokenMessenger));
        if (currentAllowance < amount) {
            bool approved = IERC20(usdc).approve(address(tokenMessenger), type(uint256).max);
            if (!approved) revert ApprovalFailed();
        }

        // Call depositForBurn (CCTP V2) - this burns USDC and creates cross-chain message
        // USDC will be minted to destContract on destination chain
        // NOTE: CCTP V2 depositForBurn returns void, nonce is emitted in event
        tokenMessenger.depositForBurn(
            amount,
            destinationDomain,
            destContract,  // mintRecipient is the destination PrivateCCTPBridge contract
            usdc,          // burnToken is local USDC
            bytes32(0),    // destinationCaller - allow any caller to receive
            0,             // maxFee - no fee limit
            0              // minFinalityThreshold - use default finality
        );

        // Generate pseudo-nonce for tracking (actual CCTP nonce is in MessageSent event)
        nonce = uint64(uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.number,
            amount,
            destinationDomain,
            msg.sender
        ))));
    }

    /**
     * @notice Lock native USDC for cross-chain transfer (for Arc Network)
     * @dev Arc uses native USDC as gas token, so we use lock/unlock model instead of burn/mint
     *
     * Since native USDC cannot be "burned" via standard CCTP TokenMessenger,
     * we use a different approach:
     * 1. Lock the native USDC in this contract (it's already here from deposits)
     * 2. Send a message via MessageTransmitter to trigger mint on destination
     * 3. On destination, the CCTP will mint new USDC to the bridge
     *
     * This requires the destination chain's bridge to have USDC liquidity or
     * be the recipient of CCTP mints.
     *
     * For full CCTP compatibility, Arc would need a wrapped USDC (WUSDC) that
     * can be burned. For now, we use message-only bridging and trust the
     * destination chain to honor the transfer.
     */
    function _burnNativeUSDC(
        uint32 destinationDomain,
        bytes32 destContract,
        uint256 amount
    ) internal returns (uint64 nonce) {
        // Check contract has enough native USDC (locked from user deposits)
        if (address(this).balance < amount) revert InsufficientBalance();

        // For Arc's native USDC, we can't use standard CCTP burn/mint
        // Instead, we mark the amount as "locked" and rely on message passing
        // The destination chain will either:
        // 1. Mint new USDC via CCTP if supported
        // 2. Release USDC from its own reserves if using lock/unlock model

        // Emit event for tracking locked amounts
        emit NativeUSDCLocked(amount, destinationDomain, destContract);

        // Return a pseudo-nonce based on block info for correlation
        // This isn't a real CCTP nonce but allows tracking
        nonce = uint64(uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.number,
            amount,
            destinationDomain
        ))));
    }

    // ============ Cross-Chain Transfer (Incoming) ============

    /**
     * @notice Handle incoming privacy metadata from CCTP
     * @dev Called by MessageTransmitter after receiving and verifying message
     *
     * This receives the privacy-related data (commitments, stealth addresses)
     * The actual USDC is received separately via CCTP TokenMessenger flow
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
            uint256[4] memory encryptedAmount,
            uint64 correlationNonce
        ) = abi.decode(
            messageBody,
            (bytes32, uint256, uint256, uint256, uint256, uint256, uint256, uint256[4], uint256[4], uint256[4], uint64)
        );

        // 4. Store or process pending deposit
        bytes32 depositKey = keccak256(abi.encodePacked(sourceDomain, recipientCommitment, amount));
        PendingDeposit storage pending = pendingDeposits[depositKey];

        if (pending.metadataReceived) revert AlreadyProcessed();

        pending.recipientCommitment = recipientCommitment;
        pending.amount = amount;
        pending.stealthData = StealthData({
            ephemeralPubKeyX: ephemeralPubKeyX,
            ephemeralPubKeyY: ephemeralPubKeyY,
            stealthAddressX: stealthAddressX,
            stealthAddressY: stealthAddressY,
            viewTag: viewTag
        });
        pending.auditData = AuditData({
            encryptedSender: encryptedSender,
            encryptedRecipient: encryptedRecipient,
            encryptedAmount: encryptedAmount
        });
        pending.sourceDomain = sourceDomain;
        pending.timestamp = block.timestamp;
        pending.metadataReceived = true;

        emit CrossChainMetadataReceived(sourceDomain, recipientCommitment, amount);

        // 5. If USDC already received, finalize the deposit
        if (pending.usdcReceived) {
            _finalizeDeposit(depositKey, pending);
        }

        return true;
    }

    /**
     * @notice Relay a cross-chain deposit from Arc (native USDC chain)
     * @dev Called by authorized relayer to complete Arc -> Other chain transfers
     *
     * This is needed because Arc's native USDC can't use standard CCTP burn/mint.
     * The relayer watches CrossChainMetadataEmitted events on Arc and calls this.
     *
     * For security, this requires:
     * 1. Caller must be admin/relayer
     * 2. This bridge must have sufficient USDC liquidity
     *
     * @param sourceDomain Must be Arc domain (26)
     * @param recipientCommitment Commitment for recipient's balance
     * @param amount Amount to credit
     * @param stealthData Stealth address data
     * @param auditData Encrypted audit data
     */
    function relayDepositFromArc(
        uint32 sourceDomain,
        bytes32 recipientCommitment,
        uint256 amount,
        StealthData calldata stealthData,
        AuditData calldata auditData
    ) external onlyAdmin {
        // Verify this is from Arc (native USDC chain)
        require(sourceDomain == 26, "Only Arc source supported");

        // Check this bridge has enough USDC liquidity
        if (!isNativeUSDC) {
            // ERC20 USDC chain - check balance
            if (IERC20(usdc).balanceOf(address(this)) < amount) revert InsufficientBalance();
        }

        // Insert commitment into Merkle tree
        uint256 leafIndex = _insertCommitment(recipientCommitment);

        // Create stealth announcement
        _createAnnouncement(
            stealthData.ephemeralPubKeyX,
            stealthData.ephemeralPubKeyY,
            stealthData.stealthAddressX,
            stealthData.stealthAddressY,
            stealthData.viewTag,
            recipientCommitment,
            sourceDomain
        );

        // Record audit data
        bytes32 txId = keccak256(abi.encodePacked(sourceDomain, recipientCommitment, block.timestamp));
        auditRecords[txId] = AuditRecord({
            encryptedSender: auditData.encryptedSender,
            encryptedRecipient: auditData.encryptedRecipient,
            encryptedAmount: auditData.encryptedAmount,
            timestamp: block.timestamp,
            sourceDomain: sourceDomain
        });

        emit CrossChainDepositReceived(sourceDomain, recipientCommitment, amount, leafIndex);
    }

    /**
     * @notice Confirm USDC receipt from CCTP
     * @dev Called after USDC is minted to this contract via CCTP
     *
     * Since USDC arrives via TokenMessenger, not our handleReceiveMessage,
     * we need a way to correlate and finalize deposits.
     *
     * Options:
     * 1. Admin/relayer calls this after confirming USDC mint
     * 2. Use events to track USDC receipts
     * 3. Check balance changes
     *
     * @param sourceDomain Source chain domain
     * @param recipientCommitment The commitment for this deposit
     * @param amount Amount of USDC received
     */
    function confirmUSDCReceived(
        uint32 sourceDomain,
        bytes32 recipientCommitment,
        uint256 amount
    ) external onlyAdmin {
        bytes32 depositKey = keccak256(abi.encodePacked(sourceDomain, recipientCommitment, amount));
        PendingDeposit storage pending = pendingDeposits[depositKey];

        if (pending.usdcReceived) revert AlreadyProcessed();
        pending.usdcReceived = true;

        emit CrossChainUSDCReceived(recipientCommitment, amount);

        // If metadata already received, finalize the deposit
        if (pending.metadataReceived) {
            _finalizeDeposit(depositKey, pending);
        }
    }

    /**
     * @notice Admin function to directly finalize a cross-chain deposit
     * @dev Used when Circle attestation is not available for metadata messages
     *      This is needed because Circle only attests TokenMessenger (USDC) messages,
     *      not arbitrary MessageTransmitter messages.
     *
     * @param sourceDomain Source chain domain ID
     * @param recipientCommitment The commitment to add to merkle tree
     * @param amount Amount of USDC (for event logging)
     */
    function adminFinalizeDeposit(
        uint32 sourceDomain,
        bytes32 recipientCommitment,
        uint256 amount
    ) external onlyAdmin {
        // Check commitment doesn't already exist
        if (commitmentExists[recipientCommitment]) revert CommitmentExists();

        // Insert commitment into Merkle tree
        uint256 leafIndex = _insertCommitment(recipientCommitment);

        emit CrossChainDepositReceived(sourceDomain, recipientCommitment, amount, leafIndex);
    }

    /**
     * @notice Finalize a cross-chain deposit after both USDC and metadata received
     */
    function _finalizeDeposit(bytes32 depositKey, PendingDeposit storage pending) internal {
        // Insert commitment into Merkle tree
        uint256 leafIndex = _insertCommitment(pending.recipientCommitment);

        // Create stealth announcement
        _createAnnouncement(
            pending.stealthData.ephemeralPubKeyX,
            pending.stealthData.ephemeralPubKeyY,
            pending.stealthData.stealthAddressX,
            pending.stealthData.stealthAddressY,
            pending.stealthData.viewTag,
            pending.recipientCommitment,
            pending.sourceDomain
        );

        // Record audit data
        bytes32 txId = keccak256(abi.encodePacked(
            pending.sourceDomain,
            pending.recipientCommitment,
            pending.amount,
            block.timestamp
        ));
        auditRecords[txId] = AuditRecord({
            encryptedSender: pending.auditData.encryptedSender,
            encryptedRecipient: pending.auditData.encryptedRecipient,
            encryptedAmount: pending.auditData.encryptedAmount,
            timestamp: block.timestamp,
            sourceDomain: pending.sourceDomain
        });

        emit CrossChainDepositReceived(
            pending.sourceDomain,
            pending.recipientCommitment,
            pending.amount,
            leafIndex
        );

        // Clean up pending deposit
        delete pendingDeposits[depositKey];
    }

    // ============ Withdraw Function ============

    /**
     * @notice Withdraw funds by proving ownership of a commitment
     * @param recipient Address to receive funds
     * @param amount Amount to withdraw
     * @param nullifier Nullifier to prevent double-spend
     * @param newCommitment New commitment for remaining balance (bytes32(0) if withdrawing all)
     * @param proof ZK withdrawal proof
     */
    function withdraw(
        address recipient,
        uint256 amount,
        bytes32 nullifier,
        bytes32 newCommitment,
        WithdrawProofData calldata proof
    ) external {
        // 1. Check nullifier not used
        if (usedNullifiers[nullifier]) revert NullifierUsed();

        // 2. Verify merkle root in proof
        if (bytes32(proof.publicSignals[0]) != merkleRoot) revert InvalidMerkleRoot();

        // 3. Verify ZK proof
        if (!_verifyWithdrawProof(proof)) revert InvalidProof();

        // 4. Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // 5. Insert new commitment if not empty
        uint256 newLeafIndex = type(uint256).max; // Max value means no new commitment
        if (newCommitment != bytes32(0)) {
            newLeafIndex = _insertCommitment(newCommitment);
        }

        // 6. Transfer funds
        if (isNativeUSDC) {
            // Arc: Native USDC
            if (address(this).balance < amount) revert InsufficientBalance();
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            // Base/Ethereum: ERC20 USDC
            if (IERC20(usdc).balanceOf(address(this)) < amount) revert InsufficientBalance();
            bool success = IERC20(usdc).transfer(recipient, amount);
            if (!success) revert TransferFailed();
        }

        emit Withdrawn(recipient, amount, nullifier, newCommitment, newLeafIndex);
    }

    // ============ Query Functions ============

    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    function getNextLeafIndex() external view returns (uint256) {
        return nextLeafIndex;
    }

    function isCommitmentExists(bytes32 commitment) external view returns (bool) {
        return commitmentExists[commitment];
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    function getDestinationContract(uint32 domain) external view returns (bytes32) {
        return destinationContracts[domain];
    }

    function getAuthorizedSource(uint32 domain) external view returns (bytes32) {
        return authorizedSources[domain];
    }

    function getPendingTransfer(uint64 nonce) external view returns (CrossChainTransfer memory) {
        return pendingTransfers[nonce];
    }

    function getPendingDeposit(bytes32 depositKey) external view returns (PendingDeposit memory) {
        return pendingDeposits[depositKey];
    }

    function getAnnouncementCount() external view returns (uint256) {
        return announcements.length;
    }

    function getAnnouncement(uint256 index) external view returns (Announcement memory) {
        require(index < announcements.length, "Invalid index");
        return announcements[index];
    }

    function getAnnouncementsByViewTag(uint256 viewTag) external view returns (uint256[] memory) {
        return announcementsByViewTag[viewTag];
    }

    function getAnnouncementsRange(uint256 start, uint256 end) external view returns (Announcement[] memory result) {
        if (end > announcements.length) end = announcements.length;
        if (start >= end) return new Announcement[](0);
        result = new Announcement[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = announcements[i];
        }
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

    function _verifyTransferProof(ProofData calldata proof) internal view returns (bool) {
        return transferVerifier.verifyProof(proof.pA, proof.pB, proof.pC, proof.publicSignals);
    }

    function _verifyWithdrawProof(WithdrawProofData calldata proof) internal view returns (bool) {
        return withdrawVerifier.verifyProof(proof.pA, proof.pB, proof.pC, proof.publicSignals);
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
