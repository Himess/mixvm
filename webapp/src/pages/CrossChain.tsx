import { useState, useEffect } from 'react'
import { parseEther } from 'viem'
import { ethers } from 'ethers'
import { usePrivateUSDC } from '../hooks/usePrivateUSDC'
import { useWalletClient, useAccount, useChainId, useSwitchChain } from 'wagmi'
import { generateStealthAddress, getPublicKeyCoordinates } from '../lib/stealth'
import { secp256k1 } from '@noble/curves/secp256k1'
import {
  CHAIN_CONFIGS,
  getChainConfig,
  getDestinationChains,
  formatUSDC,
  parseUSDC,
  type ChainConfig,
} from '../lib/chains'

// PrivateCCTPBridge ABI (unified contract)
const BRIDGE_ABI = [
  'function deposit(bytes32 commitment) external payable',
  'function depositUSDC(bytes32 commitment, uint256 amount) external',
  'function privateTransferCrossChain(uint32 destinationDomain, bytes32 nullifier, bytes32 newSenderCommitment, bytes32 recipientCommitment, uint256 amount, tuple(uint256 ephemeralPubKeyX, uint256 ephemeralPubKeyY, uint256 stealthAddressX, uint256 stealthAddressY, uint256 viewTag) stealthData, tuple(uint256[4] encryptedSender, uint256[4] encryptedRecipient, uint256[4] encryptedAmount) auditData, tuple(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] publicSignals) proof) external returns (uint64 nonce)',
  'function getMerkleRoot() view returns (bytes32)',
  'function getNextLeafIndex() view returns (uint256)',
  'event CrossChainTransferInitiated(uint64 indexed nonce, uint32 indexed destinationDomain, bytes32 recipientCommitment, uint256 amount, bytes32 nullifier)',
  'event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)',
]

// StealthRegistry ABI
const STEALTH_REGISTRY_ABI = [
  'function isUserRegistered(address user) view returns (bool)',
  'function getStealthMetaAddress(address user) view returns (tuple(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY, uint256 registeredAt))',
]

// Legacy PrivateCCTPSource address for Arc (until new bridge is deployed)
const LEGACY_CCTP_SOURCE = '0x524212d086103566D91E37c8fF493598325E8d3F'

function CrossChain() {
  const { isConnected, formattedBalance, notes } = usePrivateUSDC()
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const currentChainId = useChainId()
  const { switchChain } = useSwitchChain()

  // State
  const [sourceChainId, setSourceChainId] = useState<number>(5042002) // Default Arc
  const [destinationChainId, setDestinationChainId] = useState<number>(84532) // Default Base
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [txResult, setTxResult] = useState<{
    txHash: string
    cctpNonce: string
    destinationChain: string
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

  const handleTransfer = async () => {
    if (!recipient || !amount || parseFloat(amount) <= 0 || !walletClient || !sourceChain || !destinationChain) return

    setLocalError(null)
    setTxResult(null)
    setLocalLoading(true)

    try {
      console.log('=== CROSS-CHAIN TRANSFER START ===')
      console.log('Route:', sourceChain.shortName, '->', destinationChain.shortName)

      // Parse amount based on source chain decimals
      const amountWei = sourceChain.isNativeUSDC
        ? parseEther(amount)
        : parseUSDC(amount, sourceChainId)

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

      // Determine bridge address (use legacy for Arc until new bridge deployed)
      const bridgeAddress = sourceChain.bridge || LEGACY_CCTP_SOURCE

      // Build merkle tree
      console.log('4. Building merkle tree...')
      const { buildMerkleTreeFromEvents, initPoseidon } = await import('../lib/merkle')
      await initPoseidon()
      const tree = await buildMerkleTreeFromEvents(bridgeAddress, provider)
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

      const recipientRandomness = randomFieldElement()
      const recipientCommitment = poseidonHash([amountWei, recipientRandomness])

      const oldCommitment = poseidonHash([BigInt(note.balance), BigInt(note.randomness)])
      const nullifier = poseidonHash([BigInt(note.nullifierSecret), oldCommitment])

      console.log('6. Commitments calculated')
      console.log('   - nullifier:', toBytes32(nullifier))
      console.log('   - newSenderCommitment:', toBytes32(newSenderCommitment))
      console.log('   - recipientCommitment:', toBytes32(recipientCommitment))

      // Generate ZK proof
      console.log('7. Generating ZK proof...')
      const snarkjs = await import('snarkjs')
      const input = {
        merkleRoot: merkleProof.root.toString(),
        nullifier: nullifier.toString(),
        newSenderCommitment: newSenderCommitment.toString(),
        recipientCommitment: recipientCommitment.toString(),
        senderBalance: note.balance,
        senderRandomness: note.randomness,
        senderNullifierSecret: note.nullifierSecret,
        transferAmount: amountWei.toString(),
        newSenderRandomness: newSenderRandomness.toString(),
        recipientRandomness: recipientRandomness.toString(),
        merklePathElements: merkleProof.pathElements.map(e => e.toString()),
        merklePathIndices: merkleProof.pathIndices.map(i => i.toString()),
      }

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        '/circuits/private_transfer.wasm',
        '/circuits/private_transfer_final.zkey'
      )
      console.log('8. Proof generated')

      const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
      const parsed = JSON.parse('[' + calldata + ']')
      const proofData = {
        pA: parsed[0].map((x: string) => x),
        pB: parsed[1].map((row: string[]) => row.map((x: string) => x)),
        pC: parsed[2].map((x: string) => x),
        publicSignals: parsed[3].map((x: string) => x),
      }

      // Generate stealth address for recipient
      console.log('8.5. Generating stealth address for recipient...')
      let stealthData: {
        ephemeralPubKeyX: string
        ephemeralPubKeyY: string
        stealthAddressX: string
        stealthAddressY: string
        viewTag: string
      }

      // Check if recipient is registered on destination chain
      const destRegistry = destinationChain.stealthRegistry

      if (destRegistry) {
        try {
          const destProvider = new ethers.JsonRpcProvider(destinationChain.rpc, destinationChain.id)
          const registryContract = new ethers.Contract(destRegistry, STEALTH_REGISTRY_ABI, destProvider)

          const isRegistered = await registryContract.isUserRegistered(recipient)
          console.log('   Recipient registered on destination:', isRegistered)

          if (isRegistered) {
            // Get recipient's stealth meta-address
            const meta = await registryContract.getStealthMetaAddress(recipient)
            console.log('   Recipient stealth meta-address found')

            // Reconstruct public keys from X,Y coordinates
            const spendingPubKey = secp256k1.ProjectivePoint.fromAffine({
              x: BigInt(meta.spendingPubKeyX),
              y: BigInt(meta.spendingPubKeyY),
            }).toRawBytes(false)

            const viewingPubKey = secp256k1.ProjectivePoint.fromAffine({
              x: BigInt(meta.viewingPubKeyX),
              y: BigInt(meta.viewingPubKeyY),
            }).toRawBytes(false)

            // Generate stealth address
            const stealthResult = generateStealthAddress(spendingPubKey, viewingPubKey)
            const ephemeralCoords = getPublicKeyCoordinates(stealthResult.ephemeralPubKey)

            const stealthAddrBigInt = BigInt(stealthResult.stealthAddress)

            stealthData = {
              ephemeralPubKeyX: ephemeralCoords.x.toString(),
              ephemeralPubKeyY: ephemeralCoords.y.toString(),
              stealthAddressX: stealthAddrBigInt.toString(),
              stealthAddressY: '0',
              viewTag: stealthResult.viewTag.toString(),
            }
            console.log('   Generated stealth address:', stealthResult.stealthAddress)
          } else {
            // Recipient not registered, use their address directly
            console.log('   Recipient not registered, using direct address')
            stealthData = {
              ephemeralPubKeyX: '0',
              ephemeralPubKeyY: '0',
              stealthAddressX: BigInt(recipient).toString(),
              stealthAddressY: '0',
              viewTag: '0',
            }
          }
        } catch (regErr) {
          console.warn('   Failed to fetch stealth meta-address:', regErr)
          stealthData = {
            ephemeralPubKeyX: '0',
            ephemeralPubKeyY: '0',
            stealthAddressX: BigInt(recipient).toString(),
            stealthAddressY: '0',
            viewTag: '0',
          }
        }
      } else {
        // No registry for this chain
        stealthData = {
          ephemeralPubKeyX: '0',
          ephemeralPubKeyY: '0',
          stealthAddressX: BigInt(recipient).toString(),
          stealthAddressY: '0',
          viewTag: '0',
        }
      }

      // Audit data
      const auditData = {
        encryptedSender: ['0', '0', '0', '0'],
        encryptedRecipient: ['0', '0', '0', '0'],
        encryptedAmount: [amountWei.toString(), '0', '0', '0'],
      }

      // Call contract
      console.log('9. Calling PrivateCCTPBridge...')
      const contract = new ethers.Contract(bridgeAddress, BRIDGE_ABI, signer)
      const tx = await contract.privateTransferCrossChain(
        destinationChain.domain,
        toBytes32(nullifier),
        toBytes32(newSenderCommitment),
        toBytes32(recipientCommitment),
        amountWei,
        stealthData,
        auditData,
        proofData,
        { gasLimit: 3000000 }
      )

      console.log('10. TX sent:', tx.hash)
      const receipt = await tx.wait()
      console.log('11. TX confirmed!')

      // Find nonce from events
      let nonce = '0'
      if (receipt.logs) {
        for (const log of receipt.logs) {
          if (log.topics[0] === ethers.id('CrossChainTransferInitiated(uint64,uint32,bytes32,uint256,bytes32)')) {
            nonce = BigInt(log.topics[1]).toString()
            break
          }
        }
      }

      setTxResult({
        txHash: tx.hash,
        cctpNonce: nonce,
        destinationChain: destinationChain.name,
      })

      console.log('=== CROSS-CHAIN TRANSFER COMPLETE ===')
    } catch (err) {
      console.error('=== CROSS-CHAIN TRANSFER ERROR ===', err)
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
          <div className="grid grid-cols-3 gap-2">
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
          <div className="grid grid-cols-2 gap-2">
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
          <p className="text-xs text-slate-500 mt-1">
            For privacy, recipient should be registered on {destinationChain?.name}
          </p>
        </div>

        {/* Amount */}
        <div className="mb-6">
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

        {/* CCTP Info */}
        <div className="bg-slate-900 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-primary-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-medium">Powered by Circle CCTP</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-green-500">•</span>
              <span>Native USDC bridging (no wrapped tokens)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">•</span>
              <span>Privacy preserved on both chains</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">•</span>
              <span>6 routes supported across 3 chains</span>
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
              <p>
                <span className="text-slate-500">CCTP Nonce:</span> {txResult.cctpNonce}
              </p>
              <p>
                <span className="text-slate-500">Destination:</span> {txResult.destinationChain}
              </p>
            </div>
            <p className="text-xs text-orange-400 mt-2">
              CCTP attestation may take 10-20 minutes on testnet.
            </p>
          </div>
        )}
      </div>

      {/* All Routes Info */}
      <div className="card mt-6 bg-slate-800/50">
        <h3 className="text-sm font-medium text-slate-400 mb-3">All 6 Routes Available</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { from: 'Arc', to: 'Base', icon: 'A→B' },
            { from: 'Arc', to: 'Sepolia', icon: 'A→S' },
            { from: 'Base', to: 'Arc', icon: 'B→A' },
            { from: 'Base', to: 'Sepolia', icon: 'B→S' },
            { from: 'Sepolia', to: 'Arc', icon: 'S→A' },
            { from: 'Sepolia', to: 'Base', icon: 'S→B' },
          ].map((route, i) => (
            <div key={i} className="flex items-center gap-2 text-slate-400 p-2 bg-slate-900/50 rounded">
              <span className="text-primary-400 font-mono">{route.icon}</span>
              <span>{route.from} → {route.to}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CrossChain
