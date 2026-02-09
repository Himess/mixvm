// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMessageTransmitter
 * @notice Interface for Circle CCTP MessageTransmitter V2
 *
 * IMPORTANT: For USDC transfers, use TokenMessenger.depositForBurn() NOT sendMessage()
 * sendMessage() is only for arbitrary cross-chain messages (non-token data)
 *
 * CCTP V2 Message Flow:
 * 1. Source: depositForBurn() or sendMessage() emits MessageSent event
 * 2. Attestation: Circle signs the message (wait for attestation)
 * 3. Destination: receiveMessage() with message + attestation
 */
interface IMessageTransmitter {
    /**
     * @notice Send arbitrary message to destination domain (CCTP V2)
     * @dev ONLY use for non-token data. For USDC, use TokenMessenger.depositForBurn()
     *
     * @param destinationDomain Domain of destination chain
     * @param recipient Address of message recipient on destination domain (bytes32)
     * @param destinationCaller Caller on destination (bytes32(0) for any)
     * @param minFinalityThreshold Minimum finality level for attestation
     * @param messageBody Raw bytes content of message
     * @return nonce Reserved by message
     */
    function sendMessage(
        uint32 destinationDomain,
        bytes32 recipient,
        bytes32 destinationCaller,
        uint32 minFinalityThreshold,
        bytes calldata messageBody
    ) external returns (uint64 nonce);

    /**
     * @notice Send message with caller restriction
     * @param destinationDomain Domain of destination chain
     * @param recipient Address of message recipient on destination domain (bytes32)
     * @param destinationCaller Address allowed to call receiveMessage (bytes32)
     * @param messageBody Raw bytes content of message
     * @return nonce Reserved by message
     */
    function sendMessageWithCaller(
        uint32 destinationDomain,
        bytes32 recipient,
        bytes32 destinationCaller,
        bytes calldata messageBody
    ) external returns (uint64 nonce);

    /**
     * @notice Receive a message and relay it
     * @dev Called on destination chain with attestation from Circle
     *
     * Flow:
     * 1. Get messageHash from source chain's MessageSent event
     * 2. Poll Circle Attestation API: https://iris-api.circle.com/v2/attestations/{messageHash}
     * 3. Once status="complete", call receiveMessage with message + attestation
     *
     * @param message Bytes of message to relay (from MessageSent event)
     * @param attestation Attestation signature from Circle attestation service
     * @return success True if receive was successful
     */
    function receiveMessage(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (bool success);

    /**
     * @notice Get used nonces mapping
     * @param sourceAndNonce Combined source domain and nonce
     * @return Whether nonce has been used
     */
    function usedNonces(bytes32 sourceAndNonce) external view returns (uint256);

    /**
     * @notice Get next available nonce for this sender
     */
    function nextAvailableNonce() external view returns (uint64);

    /**
     * @notice Get local domain identifier
     * @return Local CCTP domain (0=Ethereum, 6=Base, 26=Arc)
     */
    function localDomain() external view returns (uint32);

    /**
     * @notice Get attestation validity period
     */
    function maxMessageBodySize() external view returns (uint256);

    /**
     * @notice Get version of the contract
     */
    function version() external view returns (uint32);
}

/**
 * @title IMessageHandler
 * @notice Interface for contracts that receive CCTP messages
 * @dev Implement this to receive arbitrary messages via sendMessage()
 */
interface IMessageHandler {
    /**
     * @notice Handle an incoming message from CCTP
     * @dev Called by MessageTransmitter after verifying attestation
     *
     * @param sourceDomain Domain ID of source chain
     * @param sender Address of sender contract on source chain (bytes32)
     * @param messageBody Decoded message body
     * @return success Whether handling succeeded
     */
    function handleReceiveMessage(
        uint32 sourceDomain,
        bytes32 sender,
        bytes calldata messageBody
    ) external returns (bool success);
}

/**
 * @title ITokenMinter
 * @notice Interface for CCTP TokenMinter (mints USDC on destination)
 */
interface ITokenMinter {
    /**
     * @notice Get local token address for a remote token
     */
    function getLocalToken(
        uint32 remoteDomain,
        bytes32 remoteToken
    ) external view returns (address);

    /**
     * @notice Burn local tokens (called by TokenMessenger)
     */
    function burn(address burnToken, uint256 amount) external;

    /**
     * @notice Mint local tokens (called by TokenMessenger)
     */
    function mint(
        uint32 sourceDomain,
        bytes32 burnToken,
        address to,
        uint256 amount
    ) external returns (address mintToken);
}
