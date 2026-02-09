#!/bin/bash
MESSAGE_HASH="0xd3617c3a8df8f6e76b9ea20b35f91edba59272cda276f66b93fb8762d6d5a634"
MESSAGE_BYTES="0x00000000000000060000000000000000000094300000000000000000000000009f3b8679c73c2fef8b59b4f3444d4e156fb70aa50000000000000000000000009f3b8679c73c2fef8b59b4f3444d4e156fb70aa5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e000000000000000000000000394222b73b295374b951b79d5f6796b463392f87000000000000000000000000000000000000000000000000000000000007a120000000000000000000000000a9fc0ec2a133abfcf801d8ba4c4eb4fd0c0af467"
MESSAGE_TRANSMITTER="0x7865fAfC2db2093669d92c0F33AeEF291086BEFD"
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
PRIVATE_KEY="0xbeef695a3a30c5eb3a7c3ca656e1d8ec6f9c3a98349959326fe11e4a410dbc6"

echo "$(date): Starting attestation polling..."
echo "Message Hash: $MESSAGE_HASH"

attempt=0
while [ $attempt -lt 60 ]; do
    attempt=$((attempt + 1))
    echo ""
    echo "$(date): [Attempt $attempt/60] Checking..."
    
    response=$(curl -s "https://iris-api-sandbox.circle.com/attestations/$MESSAGE_HASH")
    status=$(echo "$response" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
    
    echo "Status: $status"
    
    if [ "$status" = "complete" ]; then
        attestation=$(echo "$response" | sed -n 's/.*"attestation":"\([^"]*\)".*/\1/p')
        echo ""
        echo "ATTESTATION COMPLETE!"
        echo "Attestation: ${attestation:0:66}..."
        echo ""
        echo "Calling receiveMessage on Ethereum Sepolia..."
        
        cast send $MESSAGE_TRANSMITTER \
            "receiveMessage(bytes,bytes)" \
            "$MESSAGE_BYTES" \
            "$attestation" \
            --rpc-url $RPC_URL \
            --private-key $PRIVATE_KEY
        
        echo ""
        echo "$(date): TRANSFER COMPLETED!"
        exit 0
    fi
    
    sleep 15
done

echo "$(date): Timeout after 60 attempts"
exit 1
