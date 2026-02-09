// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITokenMessenger
 * @notice Interface for Circle CCTP TokenMessenger V2
 *
 * CCTP V2 Architecture:
 * - TokenMessenger: Logic layer for burning/minting USDC
 * - MessageTransmitter: Transport layer for cross-chain messages
 *
 * For USDC transfers, ALWAYS use TokenMessenger.depositForBurn() NOT MessageTransmitter.sendMessage()
 */
interface ITokenMessenger {
    /**
     * @notice Deposits and burns tokens from sender to be minted on destination domain.
     * @dev This is the PRIMARY function for USDC cross-chain transfers (CCTP V2)
     *
     * Flow:
     * 1. User approves TokenMessenger to spend USDC
     * 2. Call depositForBurn() - burns USDC on source, emits MessageSent
     * 3. Wait for Circle attestation service
     * 4. Call receiveMessage() on destination - mints USDC to recipient
     *
     * @param amount Amount of tokens to burn (6 decimals for USDC)
     * @param destinationDomain Destination domain identifier (0=Ethereum, 6=Base, 26=Arc)
     * @param mintRecipient Address of mint recipient on destination domain (bytes32 encoded)
     * @param burnToken Address of contract to burn deposited tokens (USDC address)
     * @param destinationCaller Authorized caller on destination (bytes32(0) for any)
     * @param maxFee Maximum fee on destination chain in burnToken units
     * @param minFinalityThreshold Minimum finality level for attestation
     * @dev CCTP V2 returns void - nonce is emitted in DepositForBurn event
     */
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;  // CCTP V2: returns void, nonce is emitted in DepositForBurn event

    /**
     * @notice Deposits and burns tokens with destination caller restriction
     * @dev Includes destinationCaller for extra security - only specified address can receive
     *
     * @param amount Amount of tokens to burn
     * @param destinationDomain Destination domain identifier
     * @param mintRecipient Address of mint recipient on destination domain (bytes32)
     * @param burnToken Address of contract to burn deposited tokens
     * @param destinationCaller Address allowed to call receiveMessage on destination (bytes32)
     * @return nonce Unique nonce reserved by message
     */
    function depositForBurnWithCaller(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller
    ) external returns (uint64 nonce);

    /**
     * @notice Deposits and burns tokens with additional hook data
     * @dev CCTP V2 feature - allows sending metadata alongside token transfer
     *
     * This enables privacy pools to:
     * - Send USDC (via burn/mint)
     * - Include commitment data, stealth addresses, audit info in hookData
     *
     * @param amount Amount of tokens to burn
     * @param destinationDomain Destination domain identifier
     * @param mintRecipient Address of mint recipient on destination domain (bytes32)
     * @param burnToken Address of contract to burn deposited tokens
     * @param destinationCaller Address allowed to call receiveMessage (bytes32(0) for any)
     * @param maxFee Maximum fee to pay for relaying (in USDC)
     * @param hookData Additional data to be passed to recipient contract
     * @return nonce Unique nonce reserved by message
     */
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        bytes calldata hookData
    ) external returns (uint64 nonce);

    /**
     * @notice Replace a depositForBurn message with a new one
     * @dev Used for replacing stuck messages or changing destination
     */
    function replaceDepositForBurn(
        bytes calldata originalMessage,
        bytes calldata originalAttestation,
        bytes32 newDestinationCaller,
        bytes32 newMintRecipient
    ) external;

    /**
     * @notice Get local message transmitter address
     */
    function localMessageTransmitter() external view returns (address);

    /**
     * @notice Get local token minter address
     */
    function localMinter() external view returns (address);

    /**
     * @notice Get message body version
     */
    function messageBodyVersion() external view returns (uint32);
}
