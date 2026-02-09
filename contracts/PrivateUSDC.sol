// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Groth16Verifier.sol";

/**
 * @title PrivateUSDC
 * @notice Private USDC transfers using ZK proofs
 *
 * This contract enables private USDC transfers on Arc Network.
 *
 * How it works:
 * 1. User deposits USDC and receives an encrypted balance (commitment)
 * 2. Transfers are done with ZK proofs - amount is hidden
 * 3. User can withdraw by proving their balance
 *
 * Privacy guarantees:
 * - Balances are hidden (stored as Poseidon commitments)
 * - Transfer amounts are hidden (only proved in ZK)
 * - Only the user knows their actual balance
 *
 * Built using open-source tools:
 * - Circom (ZK circuits)
 * - snarkjs (proof generation)
 * - Groth16 (proof system)
 */
contract PrivateUSDC {
    // ============ State Variables ============

    /// @notice The ZK proof verifier contract
    Groth16Verifier public immutable verifier;

    /// @notice Encrypted balances stored as Poseidon commitments
    /// @dev commitment = Poseidon(balance, randomness)
    mapping(address => uint256) public balanceCommitments;

    /// @notice Nullifiers to prevent double-spending
    /// @dev nullifier = Poseidon(privateKey, oldCommitment)
    mapping(uint256 => bool) public usedNullifiers;

    /// @notice Total USDC deposited (for accounting)
    uint256 public totalDeposited;

    /// @notice User registration status
    mapping(address => bool) public isRegistered;

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

    // ============ Errors ============

    error NotRegistered();
    error AlreadyRegistered();
    error InvalidProof();
    error NullifierAlreadyUsed();
    error InsufficientContractBalance();
    error InvalidCommitment();

    // ============ Constructor ============

    constructor(address _verifier) {
        verifier = Groth16Verifier(_verifier);
    }

    // ============ External Functions ============

    /**
     * @notice Register a new user with initial zero balance
     * @param initialCommitment Poseidon(0, randomness) - commitment to zero balance
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
     * @param amount Amount of USDC to deposit (in wei, so actual USDC for Arc)
     * @param newCommitment New balance commitment after deposit
     * @param pA Proof element A
     * @param pB Proof element B
     * @param pC Proof element C
     * @param publicSignals Public signals for the proof
     *
     * Note: On Arc, USDC is the native gas token, so we use msg.value
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

        // Verify the ZK proof
        // publicSignals[0] = valid (always 1)
        // publicSignals[1] = oldBalanceCommitment
        // publicSignals[2] = newBalanceCommitment

        // Check old commitment matches stored value
        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        // Check new commitment matches provided value
        if (publicSignals[2] != newCommitment) {
            revert InvalidCommitment();
        }

        // Verify the proof
        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        // Update state
        balanceCommitments[msg.sender] = newCommitment;
        totalDeposited += amount;

        emit Deposited(msg.sender, amount, newCommitment);
    }

    /**
     * @notice Perform a private transfer
     * @param nullifier Unique nullifier to prevent double-spend
     * @param newSenderCommitment Sender's new balance commitment
     * @param recipientCommitment Amount commitment for recipient
     * @param pA Proof element A
     * @param pB Proof element B
     * @param pC Proof element C
     * @param publicSignals Public signals [valid, oldCommitment, newCommitment]
     *
     * Note: In a full implementation, we'd need separate circuits for:
     * - Sender proving they have enough balance
     * - Recipient receiving the encrypted amount
     * For this PoC, we use the simple transfer circuit
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

        // Verify old commitment matches
        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        // Verify new commitment matches
        if (publicSignals[2] != newSenderCommitment) {
            revert InvalidCommitment();
        }

        // Verify the proof
        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // Update sender's commitment
        balanceCommitments[msg.sender] = newSenderCommitment;

        // Note: In full implementation, recipient's commitment would be
        // added to their balance or a separate transfer record

        emit PrivateTransfer(
            msg.sender,
            nullifier,
            newSenderCommitment,
            recipientCommitment
        );
    }

    /**
     * @notice Withdraw USDC from private balance
     * @param amount Amount to withdraw
     * @param newCommitment New balance commitment after withdrawal
     * @param pA Proof element A
     * @param pB Proof element B
     * @param pC Proof element C
     * @param publicSignals Public signals for proof
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

        // Verify old commitment matches
        if (publicSignals[1] != balanceCommitments[msg.sender]) {
            revert InvalidCommitment();
        }

        // Verify new commitment matches
        if (publicSignals[2] != newCommitment) {
            revert InvalidCommitment();
        }

        // Verify the proof
        if (!verifier.verifyProof(pA, pB, pC, publicSignals)) {
            revert InvalidProof();
        }

        // Check contract has enough balance
        if (address(this).balance < amount) {
            revert InsufficientContractBalance();
        }

        // Update state
        balanceCommitments[msg.sender] = newCommitment;
        totalDeposited -= amount;

        // Transfer USDC (native token on Arc)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount, newCommitment);
    }

    // ============ View Functions ============

    /**
     * @notice Get user's balance commitment
     * @param user Address to query
     * @return The balance commitment (not the actual balance!)
     */
    function getBalanceCommitment(address user) external view returns (uint256) {
        return balanceCommitments[user];
    }

    /**
     * @notice Check if a nullifier has been used
     * @param nullifier The nullifier to check
     */
    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    // ============ Receive Function ============

    /// @notice Allow receiving USDC (native token on Arc)
    receive() external payable {}
}
