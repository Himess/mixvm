#!/bin/bash
# Complete Base Sepolia → Ethereum Sepolia CCTP transfer
# This script polls attestation and calls receiveMessage when ready

MESSAGE_HASH="0xd3617c3a8df8f6e76b9ea20b35f91edba59272cda276f66b93fb8762d6d5a634"
MESSAGE_BYTES="0x00000000000000060000000000000000000094300000000000000000000000009f3b8679c73c2fef8b59b4f3444d4e156fb70aa50000000000000000000000009f3b8679c73c2fef8b59b4f3444d4e156fb70aa5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e000000000000000000000000394222b73b295374b951b79d5f6796b463392f87000000000000000000000000000000000000000000000000000000000007a120000000000000000000000000a9fc0ec2a133abfcf801d8ba4c4eb4fd0c0af467"

# Ethereum Sepolia MessageTransmitter
MESSAGE_TRANSMITTER="0x7865fAfC2db2093669d92c0F33AeEF291086BEFD"
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"

# Use environment variable for private key
PRIVATE_KEY="${PRIVATE_KEY:-}"

echo "=========================================="
echo "CCTP Transfer Completion: Base -> Ethereum"
echo "=========================================="
echo "Message Hash: $MESSAGE_HASH"
echo "Destination: Ethereum Sepolia"
echo ""

# Poll for attestation
attempt=0
while true; do
    attempt=$((attempt + 1))
    echo "[Attempt $attempt] Checking attestation..."

    response=$(curl -s "https://iris-api-sandbox.circle.com/attestations/$MESSAGE_HASH")

    # Extract status using grep/sed (no jq needed)
    status=$(echo "$response" | grep -oP '"status"\s*:\s*"\K[^"]+')

    echo "  Status: $status"

    if [ "$status" = "complete" ]; then
        echo ""
        echo "Attestation COMPLETE!"

        # Extract attestation
        attestation=$(echo "$response" | grep -oP '"attestation"\s*:\s*"\K[^"]+')
        echo "Attestation: ${attestation:0:50}..."

        if [ -z "$PRIVATE_KEY" ]; then
            echo ""
            echo "PRIVATE_KEY not set. To complete transfer, run:"
            echo ""
            echo "cast send $MESSAGE_TRANSMITTER \\"
            echo "  \"receiveMessage(bytes,bytes)\" \\"
            echo "  \"$MESSAGE_BYTES\" \\"
            echo "  \"$attestation\" \\"
            echo "  --rpc-url $RPC_URL \\"
            echo "  --private-key \$PRIVATE_KEY"
            exit 0
        fi

        echo ""
        echo "Calling receiveMessage on Ethereum Sepolia..."
        cast send $MESSAGE_TRANSMITTER \
            "receiveMessage(bytes,bytes)" \
            "$MESSAGE_BYTES" \
            "$attestation" \
            --rpc-url $RPC_URL \
            --private-key $PRIVATE_KEY

        echo ""
        echo "CCTP Transfer completed!"
        echo ""
        echo "USDC has been minted to the bridge contract on Ethereum."
        echo "The user's commitment is in the merkle tree - withdraw privately with ZK proof."
        exit 0
    fi

    echo "  Waiting 15 seconds..."
    sleep 15
done
