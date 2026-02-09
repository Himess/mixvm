#!/bin/bash
# Poll for CCTP attestation and complete transfer
# Usage: ./poll-and-complete.sh <message_hash> <message_bytes>

MESSAGE_HASH="${1:-0xd3617c3a8df8f6e76b9ea20b35f91edba59272cda276f66b93fb8762d6d5a634}"
MESSAGE_BYTES="$2"

# Ethereum Sepolia MessageTransmitter
MESSAGE_TRANSMITTER="0x7865fAfC2db2093669d92c0F33AeEF291086BEFD"
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
PRIVATE_KEY="0beef695a3a30c5eb3a7c3ca656e1d8ec6f9c3a98349959326fe11e4a410dbc6"

echo "=========================================="
echo "CCTP Attestation Poller & Completer"
echo "=========================================="
echo "Message Hash: $MESSAGE_HASH"
echo ""

# Poll for attestation
attempt=0
while true; do
    attempt=$((attempt + 1))
    echo "[Attempt $attempt] Checking attestation..."

    response=$(curl -s "https://iris-api-sandbox.circle.com/attestations/$MESSAGE_HASH")
    status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

    echo "  Status: $status"

    if [ "$status" = "complete" ]; then
        echo ""
        echo "✅ Attestation COMPLETE!"
        attestation=$(echo "$response" | grep -o '"attestation":"[^"]*"' | cut -d'"' -f4)
        echo "Attestation: ${attestation:0:50}..."

        if [ -n "$MESSAGE_BYTES" ]; then
            echo ""
            echo "Calling receiveMessage on Ethereum Sepolia..."
            cast send $MESSAGE_TRANSMITTER \
                "receiveMessage(bytes,bytes)" \
                "$MESSAGE_BYTES" \
                "$attestation" \
                --rpc-url $RPC_URL \
                --private-key $PRIVATE_KEY

            echo ""
            echo "✅ Transfer completed!"
        else
            echo ""
            echo "⚠️  MESSAGE_BYTES not provided."
            echo "To complete, run:"
            echo "cast send $MESSAGE_TRANSMITTER \"receiveMessage(bytes,bytes)\" <message_bytes> $attestation --rpc-url $RPC_URL --private-key \$PRIVATE_KEY"
        fi

        exit 0
    fi

    echo "  Waiting 15 seconds..."
    sleep 15
done
