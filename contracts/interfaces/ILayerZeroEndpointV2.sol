// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LayerZero V2 Endpoint Interface
 * @notice Minimal interface for LayerZero V2 messaging
 */

struct MessagingParams {
    uint32 dstEid;           // Destination endpoint ID
    bytes32 receiver;        // Receiver address as bytes32
    bytes message;           // Message payload
    bytes options;           // Execution options
    bool payInLzToken;       // Pay in LZ token or native
}

struct MessagingFee {
    uint256 nativeFee;       // Native token fee
    uint256 lzTokenFee;      // LZ token fee
}

struct MessagingReceipt {
    bytes32 guid;            // Message GUID
    uint64 nonce;            // Message nonce
    MessagingFee fee;        // Actual fee paid
}

struct Origin {
    uint32 srcEid;           // Source endpoint ID
    bytes32 sender;          // Sender address as bytes32
    uint64 nonce;            // Message nonce
}

struct SetConfigParam {
    uint32 eid;              // Endpoint ID to configure
    uint32 configType;       // Config type (2 = ULN)
    bytes config;            // Config data
}

interface ILayerZeroEndpointV2 {
    /**
     * @notice Send a message to another chain
     */
    function send(
        MessagingParams calldata _params,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory);

    /**
     * @notice Quote the fee for sending a message
     */
    function quote(
        MessagingParams calldata _params,
        address _sender
    ) external view returns (MessagingFee memory);

    /**
     * @notice Set the delegate for this OApp
     */
    function setDelegate(address _delegate) external;

    /**
     * @notice Set configuration for a library
     */
    function setConfig(
        address _oapp,
        address _lib,
        SetConfigParam[] calldata _params
    ) external;
}

interface ILayerZeroReceiver {
    /**
     * @notice Called by the endpoint when a message is received
     */
    function lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable;

    /**
     * @notice Check if the path can be initialized
     * @dev Required for LayerZero V2 to initialize the pathway
     */
    function allowInitializePath(Origin calldata _origin) external view returns (bool);

    /**
     * @notice Get next nonce for a given source
     */
    function nextNonce(uint32 _srcEid, bytes32 _sender) external view returns (uint64);
}
