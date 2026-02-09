# MixVM CCTP Message Relayer

Automated relayer service for CCTP (Cross-Chain Transfer Protocol) messages between Arc Testnet and Base Sepolia.

## Overview

The relayer monitors Arc Testnet for `CrossChainTransferInitiated` events and automatically:
1. Extracts the CCTP message from the transaction
2. Fetches attestation from Circle's attestation API
3. Relays the message to the destination chain (Base Sepolia)

## Prerequisites

- Node.js v18 or higher
- A wallet with gas on both chains:
  - Arc Testnet (for monitoring)
  - Base Sepolia (for relaying)

## Installation

```bash
cd relayer
npm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and set your configuration:
```
# Private key for relayer wallet (must have gas on both chains)
PRIVATE_KEY=your_private_key_here

# Circle API Key (for attestation service)
# Get from: https://developers.circle.com/
CIRCLE_API_KEY=your_circle_api_key

# RPC URLs (optional - defaults provided)
ARC_RPC_URL=https://arc-testnet.drpc.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

## Running the Relayer

### As a Foreground Service

```bash
npm start
```

### As a Background Service (Unix/Linux/Mac)

```bash
# Start in background
nohup npm start > relayer.log 2>&1 &

# View logs
tail -f relayer.log

# Stop the service
pkill -f "node src/index.js"
```

### As a Background Service (Windows)

Using PowerShell:
```powershell
# Start in background
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "src/index.js" -RedirectStandardOutput "relayer.log" -RedirectStandardError "relayer-error.log"

# View logs
Get-Content relayer.log -Wait

# Stop the service
Stop-Process -Name "node" -Force
```

Or use the provided batch script:
```cmd
start-relayer.bat
```

### Using PM2 (Recommended for Production)

PM2 is a production process manager for Node.js:

```bash
# Install PM2 globally
npm install -g pm2

# Start the relayer
pm2 start src/index.js --name mixvm-relayer

# View logs
pm2 logs mixvm-relayer

# Monitor
pm2 monit

# Stop
pm2 stop mixvm-relayer

# Restart
pm2 restart mixvm-relayer

# Auto-start on system boot
pm2 startup
pm2 save
```

## Manual Message Relay

To manually relay a specific transaction:

```bash
npm run relay -- <transaction_hash>
```

Example:
```bash
npm run relay -- 0x1234567890abcdef...
```

## Architecture

```
Arc Testnet                           Base Sepolia
+------------------+                  +------------------+
| PrivateCCTPSource|                  |PrivateCCTPDest   |
|   - Transfer     |                  |   - Receive      |
|   - Emit Event   |                  |   - Credit       |
+--------+---------+                  +--------+---------+
         |                                     ^
         v                                     |
+------------------+                  +------------------+
| MessageTransmit  |                  | MessageTransmit  |
|   - sendMessage  |                  |   - receiveMsg   |
+--------+---------+                  +--------+---------+
         |                                     ^
         |          +----------------+         |
         +--------->|    Relayer     |---------+
                    |  1. Monitor    |
                    |  2. Attestation|
                    |  3. Relay      |
                    +----------------+
                           |
                           v
                    +----------------+
                    |  Circle API    |
                    |  (Attestation) |
                    +----------------+
```

## Contract Addresses

### Arc Testnet (Chain ID: 5042002, CCTP Domain: 26)
- PrivateCCTPSource: `0x524212d086103566D91E37c8fF493598325E8d3F`
- MessageTransmitter: `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`

### Base Sepolia (Chain ID: 84532, CCTP Domain: 6)
- PrivateCCTPDestination: `0xF7edaD804760cfDD4050ca9623BFb421Cc2Fe2cf`
- MessageTransmitter: `0x7865fAfC2db2093669d92c0F33AeEF291086BEFD`

## Troubleshooting

### "Attestation not found" error
- Circle attestation may take 1-5 minutes after the source transaction
- The relayer will automatically retry with exponential backoff

### "Insufficient gas" error
- Ensure your relayer wallet has ETH on Base Sepolia for gas fees
- Recommended: At least 0.1 ETH on Base Sepolia

### "Transaction already relayed" error
- The message has already been relayed (possibly by another relayer)
- This is not an error, just informational

## Logs

The relayer outputs structured logs:
```
========================================
MixVM CCTP Relayer Started
========================================
Arc RPC: https://arc-testnet.drpc.org
Base Sepolia RPC: https://sepolia.base.org
Relayer address: 0x...
========================================

Listening for CrossChainTransferInitiated events...

========================================
New Cross-Chain Transfer Detected!
========================================
Nonce: 1
Destination Domain: 6
Recipient Commitment: 0x...
Amount: 1.0 USDC
TX: 0x...
--- Relaying Message ---
Message found, length: 256
Message hash: 0x...
Fetching attestation from Circle...
Attestation received!
Relaying to Base Sepolia...
Relay TX sent: 0x...
Relay TX confirmed! Block: 12345678
Message successfully relayed!
```

## License

MIT
