// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ILayerZeroEndpointV2.sol";
import "./libraries/PoseidonHasher.sol";

// Separate verifier interfaces with FIXED array sizes (matching actual verifier contracts)
interface IWithdrawVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[5] calldata _pubSignals
    ) external view returns (bool);
}

interface ITransferVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals
    ) external view returns (bool);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;
}

/**
 * @title PrivateLZBridge
 * @notice Privacy-preserving cross-chain bridge using LayerZero V2
 *
 * Architecture:
 * - Uses LayerZero V2 for cross-chain messaging (no OApp dependency)
 * - Same ZK proof system as CCTP version (Groth16, Poseidon, Merkle)
 * - Lock/Unlock model for USDC
 *
 * Flow:
 * 1. User deposits USDC → gets commitment in Merkle tree
 * 2. User initiates cross-chain transfer with ZK proof
 * 3. Commitment sent via LayerZero, USDC burned via CCTP V2 (fast transfer)
 * 4. Destination: LZ inserts commitment, CCTP mints USDC to contract
 * 5. Recipient can withdraw with ZK proof
 *
 * Dual messaging: LayerZero (commitment) + CCTP V2 (USDC)
 * Supported: Base Sepolia ↔ Ethereum Sepolia ↔ Arbitrum Sepolia
 */
contract PrivateLZBridge is ILayerZeroReceiver {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 10;
    uint256 public constant MAX_TREE_SIZE = 2 ** TREE_DEPTH;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant ROOT_HISTORY_SIZE = 100;

    // ============ Immutables ============
    ILayerZeroEndpointV2 public immutable lzEndpoint;
    ITransferVerifier public immutable transferVerifier;
    IWithdrawVerifier public immutable withdrawVerifier;
    PoseidonHasher public immutable poseidonHasher;
    IERC20 public immutable usdc;
    uint32 public immutable localEid;
    ITokenMessengerV2 public immutable cctpMessenger;

    // ============ State ============
    address public owner;

    // Merkle Tree
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public zeros;
    mapping(uint256 => bytes32) public roots;
    uint256 public currentRootIndex;
    uint256 public nextLeafIndex;

    // Nullifiers & Commitments
    mapping(bytes32 => bool) public nullifiers;
    mapping(bytes32 => bool) public commitmentExists;

    // Cross-chain Peers (EID => bytes32 address)
    mapping(uint32 => bytes32) public peers;

    // Enforced options per destination (EID => options)
    mapping(uint32 => bytes) public enforcedOptions;

    // CCTP domain mapping (LZ EID => CCTP domain)
    mapping(uint32 => uint32) public cctpDomains;
    mapping(uint32 => bool) public cctpDomainSet;

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

    // ============ Events ============
    event Deposited(
        address indexed user,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 leafIndex
    );

    event CrossChainTransferInitiated(
        uint32 indexed dstEid,
        bytes32 indexed recipientCommitment,
        uint256 amount,
        bytes32 nullifier,
        bytes32 newSenderCommitment,
        uint256 senderLeafIndex,
        bytes32 guid
    );

    event CrossChainTransferReceived(
        uint32 indexed srcEid,
        bytes32 indexed commitment,
        uint256 amount,
        uint256 leafIndex
    );

    event Withdrawn(
        address indexed recipient,
        uint256 amount,
        bytes32 indexed nullifier,
        bytes32 newCommitment,
        uint256 newLeafIndex
    );

    event PeerSet(uint32 indexed eid, bytes32 peer);
    event CCTPBurnInitiated(uint32 indexed dstDomain, uint256 amount, uint64 cctpNonce);
    event CCTPDomainSet(uint32 indexed lzEid, uint32 cctpDomain);

    // ============ Modifiers ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyEndpoint() {
        require(msg.sender == address(lzEndpoint), "Not endpoint");
        _;
    }

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _transferVerifier,
        address _withdrawVerifier,
        address _poseidonHasher,
        address _usdc,
        uint32 _localEid,
        address _owner,
        address _cctpMessenger
    ) {
        lzEndpoint = ILayerZeroEndpointV2(_endpoint);
        transferVerifier = ITransferVerifier(_transferVerifier);
        withdrawVerifier = IWithdrawVerifier(_withdrawVerifier);
        poseidonHasher = PoseidonHasher(_poseidonHasher);
        usdc = IERC20(_usdc);
        localEid = _localEid;
        owner = _owner;
        cctpMessenger = ITokenMessengerV2(_cctpMessenger);

        // Initialize Merkle tree (zeros + filledSubtrees)
        bytes32 currentZero = bytes32(0);
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
            currentZero = _hashPair(currentZero, currentZero);
        }
        roots[0] = currentZero;

        // Set this contract as delegate for receiving messages
        lzEndpoint.setDelegate(address(this));

        // Approve CCTP TokenMessenger to burn USDC
        if (_cctpMessenger != address(0)) {
            IERC20(_usdc).approve(_cctpMessenger, type(uint256).max);
        }
    }

    // ============ Admin ============
    function setPeer(uint32 _eid, bytes32 _peer) external onlyOwner {
        peers[_eid] = _peer;
        emit PeerSet(_eid, _peer);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        owner = _newOwner;
    }

    function setEnforcedOptions(uint32 _eid, bytes calldata _options) external onlyOwner {
        enforcedOptions[_eid] = _options;
    }

    // Set ULN configuration through the endpoint (called via delegate)
    function setConfig(address _lib, SetConfigParam[] calldata _params) external onlyOwner {
        lzEndpoint.setConfig(address(this), _lib, _params);
    }

    // Set CCTP domain for a LayerZero EID (e.g., LZ EID 40161 -> CCTP domain 0 for Eth Sepolia)
    function setCCTPDomain(uint32 _lzEid, uint32 _cctpDomain) external onlyOwner {
        cctpDomains[_lzEid] = _cctpDomain;
        cctpDomainSet[_lzEid] = true;
        emit CCTPDomainSet(_lzEid, _cctpDomain);
    }

    function _buildOptions(uint32 _eid, bytes calldata _extraOptions) internal view returns (bytes memory) {
        bytes memory enforced = enforcedOptions[_eid];

        // If extra options provided, use them (allows caller to override gas)
        if (_extraOptions.length > 0) {
            return _extraOptions;
        }

        // If enforced options set, use those
        if (enforced.length > 0) {
            return enforced;
        }

        // Default options: 500k gas for lzReceive (Poseidon hash is expensive!)
        // Type 3 format:
        // - 0x0003 (2 bytes) - Type 3 header
        // - 0x01 (1 byte) - WORKER_ID (Executor)
        // - 0x0011 (2 bytes) - option length (17 = 1 + 16)
        // - 0x01 (1 byte) - OPTION_TYPE_LZRECEIVE
        // - gas (16 bytes) - 500000 = 0x7a120
        // Total: 22 bytes
        return hex"0003010011010000000000000000000000000007a120";
    }

    // ============ Deposit ============
    function deposit(uint256 amount, bytes32 commitment) external {
        require(amount > 0, "Amount must be > 0");
        require(commitment != bytes32(0), "Invalid commitment");
        require(!commitmentExists[commitment], "Commitment exists");
        require(nextLeafIndex < MAX_TREE_SIZE, "Tree is full");

        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        uint256 leafIndex = _insertCommitment(commitment);
        commitmentExists[commitment] = true;

        emit Deposited(msg.sender, amount, commitment, leafIndex);
    }

    // ============ Cross-chain Transfer ============
    function initiateTransfer(
        uint32 dstEid,
        bytes32 recipientCommitment,
        uint256 amount,
        bytes32 nullifier,
        bytes32 newSenderCommitment,
        bytes32 merkleRoot,
        uint256[8] calldata proof,
        StealthData calldata stealthData,
        AuditData calldata auditData,
        bytes calldata options
    ) external payable returns (bytes32 guid) {
        require(amount > 0, "Amount must be > 0");
        require(!nullifiers[nullifier], "Nullifier already used");
        require(recipientCommitment != bytes32(0), "Invalid recipient commitment");
        require(peers[dstEid] != bytes32(0), "Peer not set");
        require(isKnownRoot(merkleRoot), "Unknown merkle root");

        // Verify ZK proof on-chain
        {
            uint256[2] memory pA = [proof[0], proof[1]];
            uint256[2][2] memory pB = [[proof[2], proof[3]], [proof[4], proof[5]]];
            uint256[2] memory pC = [proof[6], proof[7]];
            // Transfer circuit public signals: [merkleRoot, nullifier, newSenderCommitment, recipientCommitment]
            uint256[4] memory pubSignals = [
                uint256(merkleRoot),
                uint256(nullifier),
                uint256(newSenderCommitment),
                uint256(recipientCommitment)
            ];
            require(transferVerifier.verifyProof(pA, pB, pC, pubSignals), "Invalid transfer proof");
        }

        // Mark nullifier as used
        nullifiers[nullifier] = true;

        // Insert new sender commitment
        uint256 senderLeafIndex = _insertCommitment(newSenderCommitment);
        commitmentExists[newSenderCommitment] = true;

        // Encode payload
        bytes memory payload = abi.encode(
            recipientCommitment,
            amount,
            stealthData
        );

        // Build options with defaults
        bytes memory finalOptions = _buildOptions(dstEid, options);

        // Build messaging params
        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: peers[dstEid],
            message: payload,
            options: finalOptions,
            payInLzToken: false
        });

        // Send via LayerZero (commitment message)
        MessagingReceipt memory receipt = lzEndpoint.send{value: msg.value}(
            params,
            msg.sender // refund address
        );

        guid = receipt.guid;

        // Burn USDC via CCTP V2 (fast transfer) to destination contract
        if (address(cctpMessenger) != address(0) && cctpDomainSet[dstEid]) {
            uint32 destCctpDomain = cctpDomains[dstEid];
            // mintRecipient = destination chain's PrivateLZBridge (same format as LZ peer)
            bytes32 mintRecipient = peers[dstEid];

            cctpMessenger.depositForBurn(
                amount,
                destCctpDomain,
                mintRecipient,
                address(usdc),
                bytes32(0),     // anyone can relay
                amount / 1000,  // maxFee: 0.1% (for fast transfer fee)
                1000            // minFinalityThreshold: FAST TRANSFER
            );

            emit CCTPBurnInitiated(destCctpDomain, amount, 0);
        }

        emit CrossChainTransferInitiated(
            dstEid,
            recipientCommitment,
            amount,
            nullifier,
            newSenderCommitment,
            senderLeafIndex,
            guid
        );
    }

    // ============ Receive from LayerZero ============
    function lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable override onlyEndpoint {
        // Verify sender is our peer
        require(peers[_origin.srcEid] == _origin.sender, "Invalid peer");

        // Decode message
        (
            bytes32 recipientCommitment,
            uint256 amount,
            StealthData memory stealthData
        ) = abi.decode(_message, (bytes32, uint256, StealthData));

        // Insert commitment
        require(!commitmentExists[recipientCommitment], "Commitment exists");
        uint256 leafIndex = _insertCommitment(recipientCommitment);
        commitmentExists[recipientCommitment] = true;

        emit CrossChainTransferReceived(
            _origin.srcEid,
            recipientCommitment,
            amount,
            leafIndex
        );
    }

    // ============ Path Initialization (required for LZ V2) ============
    /**
     * @notice Check if the path can be initialized from a given origin
     * @dev Returns true if the sender is our configured peer for that source chain
     */
    function allowInitializePath(Origin calldata _origin) external view override returns (bool) {
        return peers[_origin.srcEid] == _origin.sender;
    }

    /**
     * @notice Returns the next expected nonce for a source
     * @dev Required by ILayerZeroReceiver - we don't enforce ordering so return 0
     */
    function nextNonce(uint32 /*_srcEid*/, bytes32 /*_sender*/) external pure override returns (uint64) {
        return 0;
    }

    // ============ Withdraw ============
    function withdraw(
        address recipient,
        uint256 amount,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes32 merkleRoot,
        uint256[8] calldata proof
    ) external {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(!nullifiers[nullifier], "Nullifier already used");
        require(usdc.balanceOf(address(this)) >= amount, "Insufficient liquidity");
        require(isKnownRoot(merkleRoot), "Unknown merkle root");

        // Verify ZK proof on-chain
        {
            uint256[2] memory pA = [proof[0], proof[1]];
            uint256[2][2] memory pB = [[proof[2], proof[3]], [proof[4], proof[5]]];
            uint256[2] memory pC = [proof[6], proof[7]];
            // Withdraw circuit public signals: [merkleRoot, nullifier, withdrawAmount, newCommitment, recipientAddress]
            uint256[5] memory pubSignals = [
                uint256(merkleRoot),
                uint256(nullifier),
                amount,
                uint256(newCommitment),
                uint256(uint160(recipient))
            ];
            require(withdrawVerifier.verifyProof(pA, pB, pC, pubSignals), "Invalid withdraw proof");
        }

        nullifiers[nullifier] = true;

        uint256 newLeafIndex = 0;
        if (newCommitment != bytes32(0)) {
            newLeafIndex = _insertCommitment(newCommitment);
            commitmentExists[newCommitment] = true;
        }

        require(usdc.transfer(recipient, amount), "Transfer failed");

        emit Withdrawn(recipient, amount, nullifier, newCommitment, newLeafIndex);
    }

    // ============ Quote Fee ============
    function quote(
        uint32 dstEid,
        bytes32 recipientCommitment,
        uint256 amount,
        StealthData calldata stealthData,
        bytes calldata options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        bytes memory payload = abi.encode(recipientCommitment, amount, stealthData);

        // Build options - same logic as _buildOptions
        bytes memory finalOptions;
        if (options.length > 0) {
            finalOptions = options;
        } else {
            bytes memory enforced = enforcedOptions[dstEid];
            if (enforced.length > 0) {
                finalOptions = enforced;
            } else {
                // Default: 500k gas (same format as _buildOptions)
                finalOptions = hex"0003010011010000000000000000000000000007a120";
            }
        }

        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: peers[dstEid],
            message: payload,
            options: finalOptions,
            payInLzToken: false
        });

        MessagingFee memory fee = lzEndpoint.quote(params, address(this));
        return (fee.nativeFee, fee.lzTokenFee);
    }

    // ============ Merkle Tree ============
    function _insertCommitment(bytes32 commitment) internal returns (uint256) {
        uint256 currentIndex = nextLeafIndex;
        require(currentIndex < MAX_TREE_SIZE, "Tree is full");

        bytes32 currentHash = commitment;
        bytes32 left;
        bytes32 right;

        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            if (currentIndex % 2 == 0) {
                left = currentHash;
                right = zeros[i];
                filledSubtrees[i] = currentHash;
            } else {
                left = filledSubtrees[i];
                right = currentHash;
            }
            currentHash = _hashPair(left, right);
            currentIndex = currentIndex / 2;
        }

        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        roots[currentRootIndex] = currentHash;
        nextLeafIndex++;

        return nextLeafIndex - 1;
    }

    function _hashPair(bytes32 left, bytes32 right) internal view returns (bytes32) {
        return bytes32(poseidonHasher.hash2(uint256(left), uint256(right)));
    }

    function isKnownRoot(bytes32 root) public view returns (bool) {
        if (root == bytes32(0)) return false;

        uint256 i = currentRootIndex;
        do {
            if (roots[i] == root) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != currentRootIndex);

        return false;
    }

    function getLastRoot() external view returns (bytes32) {
        return roots[currentRootIndex];
    }

    // ============ View Functions ============
    function getTreeInfo() external view returns (
        uint256 _nextLeafIndex,
        uint256 _maxSize,
        bytes32 _currentRoot
    ) {
        return (nextLeafIndex, MAX_TREE_SIZE, roots[currentRootIndex]);
    }

    function getBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
