import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { usePrivateUSDC } from '../hooks/usePrivateUSDC'
import { useWalletClient, useAccount, useChainId, useSwitchChain } from 'wagmi'
import { generateStealthTransfer } from '../lib/stealth'
import { secp256k1 } from '@noble/curves/secp256k1'
import {
  CHAIN_CONFIGS,
  getChainConfig,
  getDestinationChains,
  parseUSDC,
  getLzEid,
  type ChainConfig,
} from '../lib/chains'

// PrivateLZBridge ABI (LayerZero V2 - v10 with merkleRoot + proof verification)
const BRIDGE_ABI = [
  'function deposit(uint256 amount, bytes32 commitment) external',
  'function initiateTransfer(uint32 dstEid, bytes32 recipientCommitment, uint256 amount, bytes32 nullifier, bytes32 newSenderCommitment, bytes32 merkleRoot, uint256[8] proof, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData, bytes options) external payable returns (bytes32 guid)',
  'function quote(uint32 dstEid, bytes32 recipientCommitment, uint256 amount, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, bytes options) external view returns (uint256 nativeFee, uint256 lzTokenFee)',
  'function getLastRoot() view returns (bytes32)',
  'function nextLeafIndex() view returns (uint256)',
  'event CrossChainTransferInitiated(uint32 indexed dstEid, bytes32 indexed recipientCommitment, uint256 amount, bytes32 nullifier, bytes32 newSenderCommitment, uint256 senderLeafIndex, bytes32 guid)',
  'event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)',
]

// CCTP MessageTransmitterV2 ABI (for relaying USDC on destination)
const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) external returns (bool success)',
]

// StealthRegistry ABI
const STEALTH_REGISTRY_ABI = [
  'function isUserRegistered(address user) view returns (bool)',
  'function getStealthMetaAddress(address user) view returns (tuple(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY, uint256 registeredAt))',
]

// LayerZero V2 Options: 500k gas (Type 3 format)
const LZ_OPTIONS_500K = '0x0003010011010000000000000000000000000007a120'

function CrossChain() {
  const { isConnected, formattedBalance, notes, removeNote, addNote } = usePrivateUSDC()
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const currentChainId = useChainId()
  const { switchChain } = useSwitchChain()

  // State - default to Base Sepolia -> Eth Sepolia
  const [sourceChainId, setSourceChainId] = useState<number>(84532)
  const [destinationChainId, setDestinationChainId] = useState<number>(11155111)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [quotedFee, setQuotedFee] = useState<string | null>(null)
  const [txResult, setTxResult] = useState<{
    txHash: string
    guid: string
    destinationChain: string
    cctpStatus?: string
  } | null>(null)

  // Configs
  const sourceChain = getChainConfig(sourceChainId)
  const destinationChain = getChainConfig(destinationChainId)
  const availableDestinations = getDestinationChains(sourceChainId)

  // Auto-update source chain when wallet chain changes
  useEffect(() => {
    if (currentChainId && CHAIN_CONFIGS[currentChainId]) {
      setSourceChainId(currentChainId)
      // Reset destination if it's same as new source
      if (destinationChainId === currentChainId) {
        const destinations = getDestinationChains(currentChainId)
        if (destinations.length > 0) {
          setDestinationChainId(destinations[0].id)
        }
      }
    }
  }, [currentChainId])

  // Check if on correct chain
  const isOnCorrectChain = currentChainId === sourceChainId

  const hasBalance = notes.length > 0 && BigInt(notes[0]?.balance || '0') > 0n

  const handleSourceChainChange = async (chainId: number) => {
    setSourceChainId(chainId)
    setQuotedFee(null)
    // Reset destination if it matches new source
    if (destinationChainId === chainId) {
      const destinations = getDestinationChains(chainId)
      if (destinations.length > 0) {
        setDestinationChainId(destinations[0].id)
      }
    }
    // Prompt network switch
    if (currentChainId !== chainId && switchChain) {
      try {
        await switchChain({ chainId })
      } catch (err) {
        console.warn('Network switch failed:', err)
      }
    }
  }

  // Quote fee when amount changes
  useEffect(() => {
    const quoteFee = async () => {
      if (!amount || parseFloat(amount) <= 0 || !sourceChain || !destinationChain) {
        setQuotedFee(null)
        return
      }

      try {
        const provider = new ethers.JsonRpcProvider(sourceChain.rpc, sourceChain.id)
        const contract = new ethers.Contract(sourceChain.bridge, BRIDGE_ABI, provider)

        const amountWei = parseUSDC(amount, sourceChainId)
        const dstEid = getLzEid(destinationChainId)
        const testCommitment = ethers.keccak256(ethers.toUtf8Bytes('quote-test'))
        const stealthData = {
          ephemeralPubKeyX: 0n,
          ephemeralPubKeyY: 0n,
          stealthAddressX: 0n,
          stealthAddressY: 0n,
          viewTag: 0n,
        }

        const [nativeFee] = await contract.quote(
          dstEid,
          testCommitment,
          amountWei,
          stealthData,
          LZ_OPTIONS_500K
        )

        setQuotedFee(ethers.formatEther(nativeFee))
      } catch (err) {
        console.warn('Quote failed:', err)
        setQuotedFee(null)
      }
    }

    quoteFee()
  }, [amount, sourceChainId, destinationChainId])

  const handleTransfer = async () => {
    if (!recipient || !amount || parseFloat(amount) <= 0 || !walletClient || !sourceChain || !destinationChain) return

    setLocalError(null)
    setTxResult(null)
    setLocalLoading(true)

    try {
      console.log('=== LAYERZERO CROSS-CHAIN TRANSFER START ===')
      console.log('Route:', sourceChain.shortName, '->', destinationChain.shortName)

      // Parse amount
      const amountWei = parseUSDC(amount, sourceChainId)
      console.log('1. Amount:', amount, 'USDC =', amountWei.toString(), 'wei')

      const note = notes.find((n) => BigInt(n.balance) >= amountWei)
      if (!note) {
        throw new Error('Insufficient private balance')
      }
      console.log('2. Using note with balance:', note.balance)

      // Get signer
      const provider = new ethers.BrowserProvider(walletClient.transport)
      const signer = await provider.getSigner()
      console.log('3. Signer:', await signer.getAddress())

      // Initialize Poseidon
      const { buildPoseidon } = await import('circomlibjs')
      const poseidon = await buildPoseidon()
      const poseidonHash = (inputs: bigint[]): bigint => {
        const hash = poseidon(inputs.map(x => x.toString()))
        return BigInt(poseidon.F.toString(hash))
      }

      // Build merkle tree
      console.log('4. Building merkle tree...')
      const { buildMerkleTreeFromEvents, initPoseidon } = await import('../lib/merkle')
      await initPoseidon()
      const tree = await buildMerkleTreeFromEvents(sourceChain.bridge, provider, {
        deployBlock: sourceChain.deployBlock,
        rpcUrl: sourceChain.rpc,
      })
      const merkleProof = tree.getProof(note.leafIndex)
      console.log('5. Merkle proof obtained')

      // Calculate values
      const FIELD_SIZE = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')
      const randomFieldElement = () => {
        const array = new Uint8Array(31)
        crypto.getRandomValues(array)
        let hex = '0x'
        array.forEach((b) => (hex += b.toString(16).padStart(2, '0')))
        return BigInt(hex) % FIELD_SIZE
      }
      const toBytes32 = (value: bigint): string => '0x' + value.toString(16).padStart(64, '0')

      const currentBalance = BigInt(note.balance)
      const newSenderBalance = currentBalance - amountWei
      const newSenderRandomness = randomFieldElement()
      const newSenderCommitment = newSenderBalance > 0n
        ? poseidonHash([newSenderBalance, newSenderRandomness])
        : BigInt(0)

      // Generate stealth address + ECDH-derived note params for recipient
      console.log('6. Generating stealth data...')
      let recipientRandomness: bigint
      let recipientNullifierSecret: bigint
      let stealthData: {
        ephemeralPubKeyX: string
        ephemeralPubKeyY: string
        stealthAddressX: string
        stealthAddressY: string
        viewTag: string
      }
      let isStealthDerived = false

      const destRegistry = destinationChain.stealthRegistry

      if (destRegistry) {
        try {
          const destProvider = new ethers.JsonRpcProvider(destinationChain.rpc, destinationChain.id)
          const registryContract = new ethers.Contract(destRegistry, STEALTH_REGISTRY_ABI, destProvider)

          const isRegistered = await registryContract.isUserRegistered(recipient)

          if (isRegistered) {
            const meta = await registryContract.getStealthMetaAddress(recipient)

            const spendingPubKey = secp256k1.ProjectivePoint.fromAffine({
              x: BigInt(meta.spendingPubKeyX),
              y: BigInt(meta.spendingPubKeyY),
            }).toRawBytes(false)

            const viewingPubKey = secp256k1.ProjectivePoint.fromAffine({
              x: BigInt(meta.viewingPubKeyX),
              y: BigInt(meta.viewingPubKeyY),
            }).toRawBytes(false)

            // Generate stealth transfer with ECDH-derived note params
            const stealthTransfer = generateStealthTransfer(spendingPubKey, viewingPubKey)
            const stealthAddrBigInt = BigInt(stealthTransfer.stealthData.stealthAddress)

            stealthData = {
              ephemeralPubKeyX: stealthTransfer.stealthData.ephemeralPubKeyX.toString(),
              ephemeralPubKeyY: stealthTransfer.stealthData.ephemeralPubKeyY.toString(),
              stealthAddressX: stealthAddrBigInt.toString(),
              stealthAddressY: '0',
              viewTag: stealthTransfer.stealthData.viewTag.toString(),
            }

            // Use ECDH-derived note params (recipient can independently derive these)
            recipientRandomness = stealthTransfer.noteParams.randomness
            recipientNullifierSecret = stealthTransfer.noteParams.nullifierSecret
            isStealthDerived = true
            console.log('    Stealth: ECDH-derived note params (auto-scannable)')
          } else {
            recipientRandomness = randomFieldElement()
            recipientNullifierSecret = randomFieldElement()
            stealthData = {
              ephemeralPubKeyX: '0',
              ephemeralPubKeyY: '0',
              stealthAddressX: BigInt(recipient).toString(),
              stealthAddressY: '0',
              viewTag: '0',
            }
          }
        } catch (regErr) {
          console.warn('Failed to fetch stealth meta-address:', regErr)
          recipientRandomness = randomFieldElement()
          recipientNullifierSecret = randomFieldElement()
          stealthData = {
            ephemeralPubKeyX: '0',
            ephemeralPubKeyY: '0',
            stealthAddressX: BigInt(recipient).toString(),
            stealthAddressY: '0',
            viewTag: '0',
          }
        }
      } else {
        recipientRandomness = randomFieldElement()
        recipientNullifierSecret = randomFieldElement()
        stealthData = {
          ephemeralPubKeyX: '0',
          ephemeralPubKeyY: '0',
          stealthAddressX: BigInt(recipient).toString(),
          stealthAddressY: '0',
          viewTag: '0',
        }
      }

      const recipientCommitment = poseidonHash([amountWei, recipientRandomness])

      const oldCommitment = poseidonHash([BigInt(note.balance), BigInt(note.randomness)])
      const nullifier = poseidonHash([BigInt(note.nullifierSecret), oldCommitment])

      console.log('7. Commitments calculated', isStealthDerived ? '(ECDH-derived)' : '(random)')

      // Get contract's current merkle root (ground truth)
      const bridgeContract = new ethers.Contract(sourceChain.bridge, BRIDGE_ABI, provider)
      const contractMerkleRoot = await bridgeContract.getLastRoot()
      const contractRootBigInt = BigInt(contractMerkleRoot)
      console.log('6.1. Contract merkle root:', contractMerkleRoot)

      // Generate ZK proof for transfer
      console.log('7. Generating transfer ZK proof...')
      const snarkjs = await import('snarkjs')

      const transferInput = {
        // Public inputs
        merkleRoot: contractRootBigInt.toString(),
        nullifier: nullifier.toString(),
        newSenderCommitment: newSenderCommitment.toString(),
        recipientCommitment: recipientCommitment.toString(),
        // Private inputs
        senderBalance: note.balance,
        senderRandomness: note.randomness,
        senderNullifierSecret: note.nullifierSecret,
        transferAmount: amountWei.toString(),
        newSenderRandomness: newSenderRandomness.toString(),
        recipientRandomness: recipientRandomness.toString(),
        merklePathElements: merkleProof.pathElements.map(e => e.toString()),
        merklePathIndices: merkleProof.pathIndices.map(i => i.toString()),
      }

      const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
        transferInput,
        '/circuits/private_transfer.wasm',
        '/circuits/private_transfer_final.zkey'
      )
      console.log('7.1. Proof generated, public signals:', publicSignals)

      // Convert to contract format (flat uint256[8])
      const calldata = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals)
      const parsed = JSON.parse('[' + calldata + ']')
      const flatProof = [
        ...parsed[0].map((x: string) => BigInt(x).toString()),
        ...parsed[1].flat().map((x: string) => BigInt(x).toString()),
        ...parsed[2].map((x: string) => BigInt(x).toString()),
      ]
      console.log('7.2. Flat proof ready')

      // Audit data
      const auditData = {
        encryptedSender: ['0', '0', '0', '0'],
        encryptedRecipient: ['0', '0', '0', '0'],
        encryptedAmount: [amountWei.toString(), '0', '0', '0'],
      }

      // Quote fee
      console.log('8. Quoting LayerZero fee...')
      const contract = new ethers.Contract(sourceChain.bridge, BRIDGE_ABI, signer)
      const dstEid = getLzEid(destinationChainId)

      const [quotedFee] = await contract.quote(
        dstEid,
        toBytes32(recipientCommitment),
        amountWei,
        stealthData,
        LZ_OPTIONS_500K
      )
      // Add 20% buffer to prevent LZ_InsufficientFee race condition
      const nativeFee = (quotedFee * 120n) / 100n
      console.log('   Quoted Fee:', ethers.formatEther(quotedFee), 'ETH')
      console.log('   Fee with 20% buffer:', ethers.formatEther(nativeFee), 'ETH')

      // Call contract with merkleRoot + real proof
      console.log('9. Calling PrivateLZBridge.initiateTransfer...')
      const tx = await contract.initiateTransfer(
        dstEid,
        toBytes32(recipientCommitment),
        amountWei,
        toBytes32(nullifier),
        toBytes32(newSenderCommitment),
        contractMerkleRoot,  // merkleRoot from contract
        flatProof,
        stealthData,
        auditData,
        LZ_OPTIONS_500K,
        { value: nativeFee, gasLimit: 1500000 }
      )

      console.log('10. TX sent:', tx.hash)
      const receipt = await tx.wait()
      console.log('11. TX confirmed!')

      // Find GUID from events
      let guid = '0x'
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data })
            if (parsed?.name === 'CrossChainTransferInitiated') {
              guid = parsed.args.guid
              break
            }
          } catch {}
        }
      }

      // Get senderLeafIndex from event
      let senderLeafIndex = note.leafIndex + 1
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data })
            if (parsed?.name === 'CrossChainTransferInitiated') {
              senderLeafIndex = Number(parsed.args.senderLeafIndex)
            }
          } catch {}
        }
      }

      // Remove spent note
      removeNote(note.commitment)

      // Add change note on source chain if remaining balance > 0
      if (newSenderBalance > 0n) {
        addNote({
          commitment: toBytes32(newSenderCommitment),
          balance: newSenderBalance.toString(),
          randomness: newSenderRandomness.toString(),
          nullifierSecret: note.nullifierSecret,
          leafIndex: senderLeafIndex,
          chainId: sourceChainId,
        })
      }

      // Wait for LayerZero delivery on destination chain, then save recipient note
      const recipientCommitmentBytes = toBytes32(recipientCommitment)

      console.log('12. Waiting for LayerZero delivery on', destinationChain.shortName, '...')
      console.log('    Recipient commitment:', recipientCommitmentBytes)
      console.log('    Amount:', amountWei.toString())

      setTxResult({
        txHash: tx.hash,
        guid: guid,
        destinationChain: destinationChain.name,
      })

      // Poll destination chain until commitment appears (max ~5 min)
      const destProvider = new ethers.JsonRpcProvider(destinationChain.rpc, destinationChainId)
      const destContract = new ethers.Contract(destinationChain.bridge, [
        'function commitmentExists(bytes32) view returns (bool)',
        'event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)',
        'event CrossChainTransferReceived(uint32 indexed srcEid, bytes32 indexed commitment, uint256 amount, uint256 leafIndex)',
      ], destProvider)

      let delivered = false
      let destLeafIndex = 0
      const maxAttempts = 60 // 5 min (every 5 sec)

      for (let i = 0; i < maxAttempts; i++) {
        try {
          const exists = await destContract.commitmentExists(recipientCommitmentBytes)
          if (exists) {
            console.log(`13. Commitment confirmed on ${destinationChain.shortName} after ${(i + 1) * 5}s`)

            // Get leafIndex from events
            const currentBlock = await destProvider.getBlockNumber()
            const fromBlock = Math.max(0, currentBlock - 1000)

            // Check CrossChainReceived event first
            try {
              const filter = destContract.filters.CrossChainTransferReceived(null, recipientCommitmentBytes)
              const events = await destContract.queryFilter(filter, fromBlock, currentBlock)
              if (events.length > 0) {
                const e = events[events.length - 1] as ethers.EventLog
                destLeafIndex = Number(e.args?.leafIndex ?? 0)
                console.log('    LeafIndex from CrossChainReceived:', destLeafIndex)
              }
            } catch {
              // Fallback: check Deposited event
              try {
                const filter = destContract.filters.Deposited(null, null, recipientCommitmentBytes)
                const events = await destContract.queryFilter(filter, fromBlock, currentBlock)
                if (events.length > 0) {
                  const e = events[events.length - 1] as ethers.EventLog
                  destLeafIndex = Number(e.args?.leafIndex ?? 0)
                  console.log('    LeafIndex from Deposited:', destLeafIndex)
                }
              } catch (evErr) {
                console.warn('    Could not get leafIndex from events:', evErr)
              }
            }

            delivered = true
            break
          }
        } catch (pollErr) {
          console.warn(`    Poll attempt ${i + 1} error:`, pollErr)
        }

        // Wait 5 seconds before next poll
        console.log(`    Polling... attempt ${i + 1}/${maxAttempts} (${(i + 1) * 5}s)`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }

      if (delivered) {
        addNote({
          commitment: recipientCommitmentBytes,
          balance: amountWei.toString(),
          randomness: recipientRandomness.toString(),
          nullifierSecret: recipientNullifierSecret.toString(),
          leafIndex: destLeafIndex,
          chainId: destinationChainId,
        })
        console.log('14. Recipient note saved for', destinationChain.shortName)
        console.log('    LeafIndex:', destLeafIndex, 'ChainId:', destinationChainId)
      } else {
        console.error('14. LayerZero delivery timeout! Note NOT saved.')
        console.error('    You may need to manually check destination chain.')
        setLocalError('Cross-chain TX sent but LayerZero delivery not confirmed within 5 min. Check LayerZero Scan.')
      }

      // CCTP V2: Poll for attestation and relay USDC to destination
      console.log('15. Polling CCTP attestation...')
      setTxResult(prev => prev ? { ...prev, cctpStatus: 'Polling CCTP attestation...' } : prev)

      const srcCctpDomain = sourceChain.cctpDomain
      let cctpRelayed = false

      for (let i = 0; i < 60; i++) { // 5 min max
        try {
          const irisUrl = `https://iris-api-sandbox.circle.com/v2/messages/${srcCctpDomain}?transactionHash=${tx.hash}`
          const resp = await fetch(irisUrl)
          if (resp.ok) {
            const data = await resp.json()
            if (data.messages && data.messages.length > 0) {
              const msg = data.messages[0]
              console.log(`    CCTP status: ${msg.status} (attempt ${i + 1})`)

              if (msg.status === 'complete') {
                console.log('16. CCTP attestation complete! Relaying USDC...')
                setTxResult(prev => prev ? { ...prev, cctpStatus: 'Relaying USDC to destination...' } : prev)

                // Switch to destination chain
                if (currentChainId !== destinationChainId && switchChain) {
                  try {
                    await switchChain({ chainId: destinationChainId })
                    // Wait for chain switch
                    await new Promise(resolve => setTimeout(resolve, 2000))
                  } catch (switchErr) {
                    console.warn('Chain switch failed, user may need to switch manually:', switchErr)
                  }
                }

                // Get fresh signer on destination chain
                try {
                  const destWalletClient = walletClient
                  if (destWalletClient) {
                    const destProvider = new ethers.BrowserProvider(destWalletClient.transport)
                    const destSigner = await destProvider.getSigner()

                    const messageTransmitter = new ethers.Contract(
                      destinationChain.cctpMessageTransmitter,
                      MESSAGE_TRANSMITTER_ABI,
                      destSigner
                    )

                    // Get fee data and add buffer for Arb Sepolia low base fee edge case
                    const feeData = await destProvider.getFeeData()
                    const gasOverrides: Record<string, unknown> = { gasLimit: 300000 }
                    if (feeData.maxFeePerGas) {
                      gasOverrides.maxFeePerGas = feeData.maxFeePerGas * 2n
                      gasOverrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
                        ? feeData.maxPriorityFeePerGas * 2n
                        : 1000000n
                    }

                    const relayTx = await messageTransmitter.receiveMessage(
                      msg.message,
                      msg.attestation,
                      gasOverrides
                    )
                    console.log('17. CCTP relay TX:', relayTx.hash)
                    await relayTx.wait()
                    console.log('18. CCTP relay confirmed! USDC minted to destination contract.')
                    cctpRelayed = true
                    setTxResult(prev => prev ? { ...prev, cctpStatus: 'USDC relayed!' } : prev)
                  }
                } catch (relayErr) {
                  console.error('CCTP relay failed:', relayErr)
                  setTxResult(prev => prev ? { ...prev, cctpStatus: 'CCTP relay failed - try manually' } : prev)
                }
                break
              }
            }
          }
        } catch (pollErr) {
          console.warn(`    CCTP poll attempt ${i + 1} error:`, pollErr)
        }

        await new Promise(resolve => setTimeout(resolve, 5000))
      }

      if (!cctpRelayed) {
        console.warn('CCTP attestation not ready within 5 min. USDC relay pending.')
        setTxResult(prev => prev ? { ...prev, cctpStatus: 'CCTP attestation pending - check back later' } : prev)
      }

      console.log('=== LAYERZERO + CCTP TRANSFER COMPLETE ===')
    } catch (err) {
      console.error('=== LAYERZERO TRANSFER ERROR ===', err)
      const message = err instanceof Error ? err.message : 'Cross-chain transfer failed'
      setLocalError(message)
    } finally {
      setLocalLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to use cross-chain transfers.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Cross-Chain Transfer</h1>

      <div className="card">
        {/* Current Balance */}
        <div className="mb-6 p-4 bg-slate-900 rounded-lg">
          <p className="text-sm text-slate-400">Available Private Balance</p>
          <p className="text-2xl font-bold text-white">{formattedBalance} USDC</p>
          {!hasBalance && (
            <p className="text-xs text-orange-400 mt-1">
              No balance available. Deposit first.
            </p>
          )}
        </div>

        {/* Source Chain Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            From (Source Chain)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(CHAIN_CONFIGS).map((chain) => (
              <button
                key={chain.id}
                onClick={() => handleSourceChainChange(chain.id)}
                className={`p-3 rounded-lg border transition-all ${
                  sourceChainId === chain.id
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    sourceChainId === chain.id ? 'bg-primary-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {chain.shortName[0]}
                  </div>
                  <span className={`text-xs ${sourceChainId === chain.id ? 'text-white' : 'text-slate-400'}`}>
                    {chain.shortName}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {!isOnCorrectChain && (
            <p className="text-xs text-orange-400 mt-2">
              Please switch to {sourceChain?.name} network
            </p>
          )}
        </div>

        {/* Arrow */}
        <div className="flex justify-center my-3">
          <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* Destination Chain */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            To (Destination Chain)
          </label>
          <div className="grid grid-cols-1 gap-2">
            {availableDestinations.map((chain) => (
              <button
                key={chain.id}
                onClick={() => setDestinationChainId(chain.id)}
                className={`p-3 rounded-lg border transition-all ${
                  destinationChainId === chain.id
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    destinationChainId === chain.id ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {chain.shortName[0]}
                  </div>
                  <span className={`text-sm ${destinationChainId === chain.id ? 'text-white' : 'text-slate-300'}`}>
                    {chain.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Route Display */}
        <div className="mb-4 p-3 bg-slate-900/50 rounded-lg flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center text-xs text-white font-bold">
              {sourceChain?.shortName[0]}
            </div>
            <span className="text-slate-300 text-sm">{sourceChain?.shortName}</span>
          </div>
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-xs text-white font-bold">
              {destinationChain?.shortName[0]}
            </div>
            <span className="text-slate-300 text-sm">{destinationChain?.shortName}</span>
          </div>
        </div>

        {/* Recipient Address */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="input w-full"
            disabled={localLoading || !hasBalance}
          />
        </div>

        {/* Amount */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Amount (USDC)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input w-full text-lg"
            disabled={localLoading || !hasBalance}
            step="0.001"
            min="0"
          />
        </div>

        {/* Fee Quote */}
        {quotedFee && (
          <div className="mb-4 p-3 bg-slate-900/50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">LayerZero Fee:</span>
              <span className="text-white font-medium">{parseFloat(quotedFee).toFixed(6)} ETH</span>
            </div>
          </div>
        )}

        {/* LayerZero Info */}
        <div className="bg-slate-900 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-primary-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-medium">Powered by LayerZero V2</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-green-500">*</span>
              <span>Fast cross-chain messaging (~2-3 min)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">*</span>
              <span>Privacy preserved on both chains</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">*</span>
              <span>Lock/Unlock model for USDC</span>
            </li>
          </ul>
        </div>

        {/* Error Display */}
        {localError && (
          <div className="mb-4 p-4 bg-red-500/10 rounded-lg">
            <p className="text-red-400 text-sm">{localError}</p>
          </div>
        )}

        {/* Transfer Button */}
        <button
          onClick={handleTransfer}
          disabled={localLoading || !hasBalance || !recipient || !amount || parseFloat(amount) <= 0 || !isOnCorrectChain}
          className="btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {localLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : !isOnCorrectChain ? (
            `Switch to ${sourceChain?.name}`
          ) : (
            `Transfer to ${destinationChain?.name}`
          )}
        </button>

        {/* Success Result */}
        {txResult && (
          <div className="mt-4 p-4 bg-green-500/10 rounded-lg">
            <p className="text-green-400 text-sm font-medium mb-2">Transfer initiated!</p>
            <div className="space-y-1 text-xs text-slate-400">
              <p className="break-all">
                <span className="text-slate-500">TX:</span> {txResult.txHash}
              </p>
              <p className="break-all">
                <span className="text-slate-500">GUID:</span> {txResult.guid}
              </p>
              <p>
                <span className="text-slate-500">Destination:</span> {txResult.destinationChain}
              </p>
              {txResult.cctpStatus && (
                <p>
                  <span className="text-slate-500">CCTP:</span> {txResult.cctpStatus}
                </p>
              )}
            </div>
            <a
              href={`https://testnet.layerzeroscan.com/tx/${txResult.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-400 hover:underline mt-2 inline-block"
            >
              Track on LayerZero Scan
            </a>
          </div>
        )}
      </div>

      {/* Routes Info */}
      <div className="card mt-6 bg-slate-800/50">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Available Routes</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { from: 'Base', to: 'Sepolia', icon: 'B' },
            { from: 'Sepolia', to: 'Base', icon: 'S' },
          ].map((route, i) => (
            <div key={i} className="flex items-center gap-2 text-slate-400 p-2 bg-slate-900/50 rounded">
              <span className="text-primary-400 font-mono">{route.icon}</span>
              <span>{route.from} {'→'} {route.to}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CrossChain
