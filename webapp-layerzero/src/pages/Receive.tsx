import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, useChainId } from 'wagmi'
import { ethers } from 'ethers'
import {
  generateStealthKeys,
  createStealthMetaAddress,
  storeStealthKeys,
  loadStealthKeys,
  tryDeriveNoteFromEphemeralKey,
  StealthKeys,
  StealthMetaAddress,
} from '../lib/stealth'
import { useSDKStore } from '../lib/store'
import { CHAIN_CONFIGS, formatUSDC, type ChainConfig } from '../lib/chains'

// Bridge ABI for scanning received transfers
const BRIDGE_ABI = [
  'event CrossChainTransferReceived(uint32 indexed srcEid, bytes32 indexed commitment, uint256 amount, uint256 leafIndex)',
  'event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)',
]

// lzReceive function selector for decoding calldata
const LZ_RECEIVE_ABI = [
  'function lzReceive(tuple(uint32 srcEid, bytes32 sender, uint64 nonce) _origin, bytes32 _guid, bytes _message, address _executor, bytes _extraData)',
]

// StealthRegistry ABI
const STEALTH_REGISTRY_ABI = [
  'function registerStealthMetaAddress(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY) external',
  'function isUserRegistered(address user) view returns (bool)',
  'function getStealthMetaAddress(address user) view returns (tuple(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY, uint256 registeredAt))',
]

// StealthRegistry addresses per chain
const STEALTH_REGISTRIES: Record<number, string> = {
  84532: '0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5', // Base Sepolia
}

interface FoundNote {
  commitment: string
  balance: string
  randomness: string
  nullifierSecret: string
  leafIndex: number
  chainId: number
  amount: string
  source: 'stealth' | 'self'
}

function Receive() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { addNote, notes } = useSDKStore()

  const [stealthKeys, setStealthKeys] = useState<StealthKeys | null>(null)
  const [metaAddress, setMetaAddress] = useState<StealthMetaAddress | null>(null)
  const [isKeysGenerated, setIsKeysGenerated] = useState(false)
  const [isOnChainRegistered, setIsOnChainRegistered] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [foundNotes, setFoundNotes] = useState<FoundNote[]>([])
  const [scanStatus, setScanStatus] = useState<string>('')
  const [importedCommitments, setImportedCommitments] = useState<Set<string>>(new Set())

  // Load existing keys on mount
  useEffect(() => {
    if (address) {
      const keys = loadStealthKeys(address)
      if (keys) {
        setStealthKeys(keys)
        setMetaAddress(createStealthMetaAddress(keys))
        setIsKeysGenerated(true)
      }
      const imported = new Set(notes.map(n => n.commitment.toLowerCase()))
      setImportedCommitments(imported)
    }
  }, [address, notes])

  // Check on-chain registration
  useEffect(() => {
    const checkRegistration = async () => {
      if (!address || !stealthKeys) return

      // Check all chains that have a StealthRegistry
      for (const [chainIdStr, registryAddress] of Object.entries(STEALTH_REGISTRIES)) {
        const cId = parseInt(chainIdStr)
        const config = CHAIN_CONFIGS[cId]
        if (!config) continue

        try {
          const provider = new ethers.JsonRpcProvider(config.rpc, cId)
          const registry = new ethers.Contract(registryAddress, STEALTH_REGISTRY_ABI, provider)
          const registered = await registry.isUserRegistered(address)
          if (registered) {
            setIsOnChainRegistered(true)
            console.log(`User registered on chain ${cId}`)
            return
          }
        } catch (err) {
          console.warn(`Failed to check registration on chain ${cId}:`, err)
        }
      }
      setIsOnChainRegistered(false)
    }

    checkRegistration()
  }, [address, stealthKeys])

  const handleGenerateKeys = async () => {
    if (!address) return

    setIsLoading(true)
    try {
      const keys = generateStealthKeys()
      const meta = createStealthMetaAddress(keys)
      storeStealthKeys(address, keys)
      setStealthKeys(keys)
      setMetaAddress(meta)
      setIsKeysGenerated(true)
      console.log('Stealth keys generated and stored')
    } catch (err) {
      console.error('Failed to generate keys:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegisterOnChain = async () => {
    if (!walletClient || !metaAddress) return

    // Find registry on current chain or Base Sepolia
    const registryChainId = STEALTH_REGISTRIES[chainId] ? chainId : 84532
    const registryAddress = STEALTH_REGISTRIES[registryChainId]
    if (!registryAddress) {
      console.error('No StealthRegistry on current chain')
      return
    }

    setIsRegistering(true)
    try {
      const provider = new ethers.BrowserProvider(walletClient.transport)
      const signer = await provider.getSigner()
      const registry = new ethers.Contract(registryAddress, STEALTH_REGISTRY_ABI, signer)

      const tx = await registry.registerStealthMetaAddress(
        metaAddress.spendingPubKeyX.toString(),
        metaAddress.spendingPubKeyY.toString(),
        metaAddress.viewingPubKeyX.toString(),
        metaAddress.viewingPubKeyY.toString(),
        { gasLimit: 200000 }
      )

      console.log('Registration TX sent:', tx.hash)
      await tx.wait()
      console.log('Registration confirmed!')
      setIsOnChainRegistered(true)
    } catch (err) {
      console.error('Registration failed:', err)
    } finally {
      setIsRegistering(false)
    }
  }

  /**
   * Scan bridge events on all chains for incoming transfers.
   * For each CrossChainTransferReceived event:
   * 1. Get the TX that triggered it (lzReceive call)
   * 2. Decode calldata to extract stealthData (ephemeralPubKeyX/Y)
   * 3. Try ECDH with our viewing key to derive note params
   * 4. Verify commitment matches → this note is for us
   */
  const handleScanPayments = async () => {
    if (!stealthKeys) return

    setIsLoading(true)
    setScanStatus('Starting scan...')
    setFoundNotes([])

    try {
      // Load poseidon
      const { buildPoseidon } = await import('circomlibjs')
      const poseidon = await buildPoseidon()
      const poseidonHash = (inputs: bigint[]): bigint => {
        const hash = poseidon(inputs.map((i) => poseidon.F.e(i)))
        return BigInt(poseidon.F.toString(hash))
      }

      const lzReceiveIface = new ethers.Interface(LZ_RECEIVE_ABI)
      const allFoundNotes: FoundNote[] = []

      // Scan all supported chains
      const chains = Object.values(CHAIN_CONFIGS) as ChainConfig[]

      for (const config of chains) {
        setScanStatus(`Scanning ${config.name}...`)
        console.log(`Scanning bridge on ${config.name}: ${config.bridge}`)

        try {
          const provider = new ethers.JsonRpcProvider(config.rpc, config.id)
          const bridge = new ethers.Contract(config.bridge, BRIDGE_ABI, provider)

          const currentBlock = await provider.getBlockNumber()
          const fromBlock = config.deployBlock

          // Scan CrossChainTransferReceived events
          const CHUNK_SIZE = 10000
          const events: ethers.EventLog[] = []

          for (let from = fromBlock; from <= currentBlock; from += CHUNK_SIZE) {
            const to = Math.min(from + CHUNK_SIZE - 1, currentBlock)
            const filter = bridge.filters.CrossChainTransferReceived()
            const chunk = await bridge.queryFilter(filter, from, to)
            events.push(...(chunk as ethers.EventLog[]))
          }

          console.log(`  Found ${events.length} CrossChainTransferReceived event(s)`)

          for (const event of events) {
            const commitment = event.args[1] as string
            const amount = event.args[2] as bigint
            const leafIndex = Number(event.args[3])

            // Skip if already imported
            if (importedCommitments.has(commitment.toLowerCase())) continue

            // Get the TX calldata to extract stealthData
            try {
              const tx = await provider.getTransaction(event.transactionHash)
              if (!tx || !tx.data) continue

              // Decode lzReceive calldata
              const decoded = lzReceiveIface.decodeFunctionData('lzReceive', tx.data)
              const message = decoded[2] as string // _message parameter

              // Decode message: (bytes32 recipientCommitment, uint256 amount, StealthData)
              const msgDecoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['bytes32', 'uint256', 'tuple(uint256,uint256,uint256,uint256,uint256)'],
                message
              )

              const stealthTuple = msgDecoded[2]
              const ephemeralPubKeyX = BigInt(stealthTuple[0])
              const ephemeralPubKeyY = BigInt(stealthTuple[1])

              // Try to derive note params from ECDH
              const noteParams = tryDeriveNoteFromEphemeralKey(
                stealthKeys.viewingPrivateKey,
                ephemeralPubKeyX,
                ephemeralPubKeyY,
              )

              if (!noteParams) continue // ephemeralPubKey was zero or derivation failed

              // Verify: compute commitment and check if it matches
              const derivedCommitment = poseidonHash([amount, noteParams.randomness])
              const expectedCommitment = '0x' + derivedCommitment.toString(16).padStart(64, '0')

              if (expectedCommitment.toLowerCase() !== commitment.toLowerCase()) continue

              // Match! This note is for us
              console.log(`  MATCH on ${config.name}: ${commitment.slice(0, 14)}...`)

              allFoundNotes.push({
                commitment,
                balance: amount.toString(),
                randomness: noteParams.randomness.toString(),
                nullifierSecret: noteParams.nullifierSecret.toString(),
                leafIndex,
                chainId: config.id,
                amount: formatUSDC(amount, config.id),
                source: 'stealth',
              })
            } catch (decodeErr) {
              // TX decode failed - skip
              console.warn(`  Failed to decode TX ${event.transactionHash}:`, decodeErr)
            }
          }
        } catch (chainErr) {
          console.warn(`Failed to scan ${config.name}:`, chainErr)
        }
      }

      setFoundNotes(allFoundNotes)
      setScanStatus(
        allFoundNotes.length > 0
          ? `Found ${allFoundNotes.length} note(s) for you!`
          : 'No notes found'
      )
      console.log('Scan complete. Total found:', allFoundNotes.length)
    } catch (err) {
      console.error('Scan failed:', err)
      setScanStatus('Scan failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleImportNote = (note: FoundNote) => {
    try {
      addNote({
        commitment: note.commitment,
        balance: note.balance,
        randomness: note.randomness,
        nullifierSecret: note.nullifierSecret,
        leafIndex: note.leafIndex,
        chainId: note.chainId,
      })
      setImportedCommitments(prev => new Set([...prev, note.commitment.toLowerCase()]))
      console.log('Note imported:', note.commitment.slice(0, 14), 'on chain', note.chainId)
    } catch (err) {
      console.error('Failed to import note:', err)
    }
  }

  const handleImportAll = () => {
    for (const note of foundNotes) {
      if (!importedCommitments.has(note.commitment.toLowerCase())) {
        handleImportNote(note)
      }
    }
  }

  const formatKey = (key: bigint) => {
    const hex = key.toString(16).padStart(64, '0')
    return '0x' + hex.slice(0, 8) + '...' + hex.slice(-8)
  }

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to receive private payments.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Receive Payments</h1>

      {!isKeysGenerated ? (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Setup Stealth Address</h2>
          <p className="text-slate-400 mb-6">
            Generate your stealth keys to receive private payments. Your spending and viewing
            keys will be stored locally.
          </p>

          <div className="bg-slate-900 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-slate-400 mb-2">How it works</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>1. Generate your stealth keys</li>
              <li>2. Register on-chain (so senders can find your public key)</li>
              <li>3. When someone sends you USDC, their transfer includes encrypted data</li>
              <li>4. Scan to automatically find and import your notes</li>
            </ul>
          </div>

          <button
            onClick={handleGenerateKeys}
            disabled={isLoading}
            className="btn-primary w-full py-3"
          >
            {isLoading ? 'Generating...' : 'Generate Stealth Keys'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Registration Status */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Registration Status</h2>

            <div className="flex items-center gap-3 mb-4">
              <div className={`w-3 h-3 rounded-full ${isOnChainRegistered ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-slate-300">
                {isOnChainRegistered ? 'Registered on-chain' : 'Not registered on-chain'}
              </span>
            </div>

            {!isOnChainRegistered && (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  Register your viewing public key on-chain so senders can derive encrypted
                  note data for you. This enables automatic note scanning.
                </p>
                <button
                  onClick={handleRegisterOnChain}
                  disabled={isRegistering}
                  className="btn-primary w-full py-2"
                >
                  {isRegistering ? 'Registering...' : 'Register On-Chain'}
                </button>
              </>
            )}

            {metaAddress && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="bg-slate-900 rounded-lg p-3">
                  <p className="text-slate-500 text-xs mb-1">Viewing Public Key</p>
                  <p className="text-slate-300 font-mono break-all text-xs">
                    {formatKey(metaAddress.viewingPubKeyX)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Scan for Notes */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Scan for Notes</h2>
            <p className="text-slate-400 text-sm mb-4">
              Scans bridge contracts on all chains for transfers sent to you.
              Uses your viewing key to automatically derive and verify note data.
            </p>

            <button
              onClick={handleScanPayments}
              disabled={isLoading}
              className="btn-primary w-full py-3 mb-4"
            >
              {isLoading ? 'Scanning...' : 'Scan All Chains'}
            </button>

            {scanStatus && (
              <p className="text-xs text-slate-400 mb-4 text-center">{scanStatus}</p>
            )}

            {foundNotes.length === 0 && !isLoading ? (
              <div className="text-center py-8 text-slate-500">
                <p>No notes found yet.</p>
                <p className="text-xs mt-1">Make sure someone has sent you a private transfer with stealth addressing.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {foundNotes.length > 1 && (
                  <button
                    onClick={handleImportAll}
                    className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition-colors"
                  >
                    Import All ({foundNotes.filter(n => !importedCommitments.has(n.commitment.toLowerCase())).length} new)
                  </button>
                )}

                {foundNotes.map((note, i) => {
                  const isImported = importedCommitments.has(note.commitment.toLowerCase())
                  const chainConfig = CHAIN_CONFIGS[note.chainId]

                  return (
                    <div key={i} className="bg-slate-900 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-white font-medium">
                            {note.amount} USDC
                          </p>
                          <p className="text-xs text-slate-500 mt-1 font-mono">
                            {note.commitment.slice(0, 14)}...{note.commitment.slice(-8)}
                          </p>
                        </div>
                        {isImported ? (
                          <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
                            Imported
                          </span>
                        ) : (
                          <button
                            onClick={() => handleImportNote(note)}
                            className="text-xs px-3 py-1 rounded bg-primary-500 hover:bg-primary-400 text-white transition-colors"
                          >
                            Import
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {chainConfig?.shortName || `Chain ${note.chainId}`} | Leaf: {note.leafIndex}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Key Management */}
          <div className="card bg-slate-800/50">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Key Management</h3>
            <p className="text-xs text-slate-500 mb-3">
              Your stealth keys are stored locally in your browser. Do not clear browser data
              or you will lose access to received payments.
            </p>
            <button
              onClick={() => {
                if (confirm('This will delete your local stealth keys. Are you sure?')) {
                  if (address) {
                    localStorage.removeItem('stealth_keys_' + address.toLowerCase())
                    setStealthKeys(null)
                    setMetaAddress(null)
                    setIsKeysGenerated(false)
                    setIsOnChainRegistered(false)
                  }
                }
              }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Delete Local Keys
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Receive
