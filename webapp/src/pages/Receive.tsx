import { useState, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { ethers } from 'ethers'
import { formatEther } from 'viem'
import {
  generateStealthKeys,
  createStealthMetaAddress,
  storeStealthKeys,
  loadStealthKeys,
  decryptNoteData,
  StealthKeys,
  StealthMetaAddress,
} from '../lib/stealth'
import { useSDKStore } from '../lib/store'

// StealthRegistry contract addresses
// OLD registry - for existing registrations (has stealth keys)
const STEALTH_REGISTRY_OLD: Record<number, string> = {
  5042002: '0xd209CbDD434F646388775A8223c4644491c89fB1', // Arc Testnet (original - for checking registration)
  84532: '0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5',   // Base Sepolia
}
// NEW registry - for announcements (has announce function)
const STEALTH_REGISTRIES: Record<number, string> = {
  5042002: '0x137e9693080E9beA3D6cB399EF1Ca33CE72c5477', // Arc Testnet (new with announce function)
  84532: '0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5',   // Base Sepolia
}

const STEALTH_REGISTRY_ABI = [
  'function getAnnouncementCount() view returns (uint256)',
  'function getAnnouncementsRange(uint256 start, uint256 end) view returns (tuple(uint256 schemeId, address stealthAddress, address caller, bytes ephemeralPubKey, bytes metadata, uint256 timestamp)[])',
  'function registerStealthMetaAddress(uint256 spendingPubKeyX, uint256 spendingPubKeyY, uint256 viewingPubKeyX, uint256 viewingPubKeyY) external',
  'function isUserRegistered(address user) view returns (bool)',
]

const RPC_URLS: Record<number, string> = {
  5042002: 'https://arc-testnet.drpc.org',
  84532: 'https://sepolia.base.org',
}

interface DecryptedNote {
  commitment: string
  balance: string
  randomness: string
  nullifierSecret: string
  leafIndex: number
  chainId: number
  announcementIndex: number
}

function Receive() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { addNote, notes } = useSDKStore()

  const [stealthKeys, setStealthKeys] = useState<StealthKeys | null>(null)
  const [metaAddress, setMetaAddress] = useState<StealthMetaAddress | null>(null)
  const [isKeysGenerated, setIsKeysGenerated] = useState(false)
  const [isOnChainRegistered, setIsOnChainRegistered] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [foundNotes, setFoundNotes] = useState<DecryptedNote[]>([])
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

      // Check existing notes to mark as imported
      const imported = new Set(notes.map(n => n.commitment.toLowerCase()))
      setImportedCommitments(imported)
    }
  }, [address, notes])

  // Check on-chain registration when keys are loaded (check OLD registry where existing users are registered)
  useEffect(() => {
    const checkRegistration = async () => {
      if (!address || !stealthKeys) return

      try {
        const provider = new ethers.JsonRpcProvider(RPC_URLS[5042002], 5042002)
        // Check OLD registry first (where existing registrations are)
        const oldRegistry = new ethers.Contract(STEALTH_REGISTRY_OLD[5042002], STEALTH_REGISTRY_ABI, provider)
        let registered = await oldRegistry.isUserRegistered(address)

        // If not in old, check new registry
        if (!registered) {
          const newRegistry = new ethers.Contract(STEALTH_REGISTRIES[5042002], STEALTH_REGISTRY_ABI, provider)
          registered = await newRegistry.isUserRegistered(address)
        }

        setIsOnChainRegistered(registered)
        console.log('User registration status:', registered)
      } catch (err) {
        console.error('Failed to check registration:', err)
      }
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

    setIsRegistering(true)
    try {
      const provider = new ethers.BrowserProvider(walletClient.transport)
      const signer = await provider.getSigner()
      const registry = new ethers.Contract(STEALTH_REGISTRIES[5042002], STEALTH_REGISTRY_ABI, signer)

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

  const handleScanPayments = async () => {
    if (!stealthKeys) return

    setIsLoading(true)
    setScanStatus('Starting scan...')
    setFoundNotes([])

    try {
      const allFoundNotes: DecryptedNote[] = []

      // Scan all supported chains
      for (const [chainIdStr, registryAddress] of Object.entries(STEALTH_REGISTRIES)) {
        const chainId = parseInt(chainIdStr)
        const rpcUrl = RPC_URLS[chainId]
        if (!rpcUrl) continue

        setScanStatus(`Scanning chain ${chainId}...`)
        console.log(`Scanning StealthRegistry on chain ${chainId}:`, registryAddress)

        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl, chainId)
          const registry = new ethers.Contract(registryAddress, STEALTH_REGISTRY_ABI, provider)

          // Get total announcement count
          const count = await registry.getAnnouncementCount()
          const totalCount = Number(count)
          console.log(`  Total announcements: ${totalCount}`)

          if (totalCount === 0) continue

          // Fetch announcements in batches
          const BATCH_SIZE = 50
          let decryptedCount = 0

          for (let i = 0; i < totalCount; i += BATCH_SIZE) {
            const end = Math.min(i + BATCH_SIZE, totalCount)
            setScanStatus(`Chain ${chainId}: checking ${i}-${end} of ${totalCount}...`)

            const batch = await registry.getAnnouncementsRange(i, end)

            for (let j = 0; j < batch.length; j++) {
              const ann = batch[j]

              // Skip if no metadata (no encrypted note data)
              if (!ann.metadata || ann.metadata === '0x' || ann.metadata.length < 100) {
                continue
              }

              // Try to decrypt the metadata with our viewing private key
              try {
                const noteData = await decryptNoteData(
                  stealthKeys.viewingPrivateKey,
                  ann.metadata
                )

                if (noteData) {
                  console.log(`  Found note at index ${i + j}:`, noteData.commitment)
                  decryptedCount++

                  allFoundNotes.push({
                    ...noteData,
                    chainId,
                    announcementIndex: i + j,
                  })
                }
              } catch {
                // Decryption failed - this note is not for us
              }
            }
          }

          console.log(`  Chain ${chainId}: Decrypted ${decryptedCount} notes`)
        } catch (chainErr) {
          console.error(`Failed to scan chain ${chainId}:`, chainErr)
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

  const handleImportNote = (note: DecryptedNote) => {
    try {
      addNote({
        commitment: note.commitment,
        balance: note.balance,
        randomness: note.randomness,
        nullifierSecret: note.nullifierSecret,
        leafIndex: note.leafIndex,
      })

      setImportedCommitments(prev => new Set([...prev, note.commitment.toLowerCase()]))
      console.log('Note imported successfully:', note.commitment)
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
              <li>2. Register on-chain (so senders can encrypt notes for you)</li>
              <li>3. Senders encrypt note data with your viewing key</li>
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
                  Register your viewing public key on-chain so senders can automatically encrypt
                  note data for you. This enables auto-scanning.
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
              Scan the blockchain for encrypted notes sent to you. Notes will be automatically
              decrypted using your viewing key.
            </p>

            <button
              onClick={handleScanPayments}
              disabled={isLoading}
              className="btn-primary w-full py-3 mb-4"
            >
              {isLoading ? 'Scanning...' : 'Scan for Encrypted Notes'}
            </button>

            {scanStatus && (
              <p className="text-xs text-slate-400 mb-4 text-center">{scanStatus}</p>
            )}

            {foundNotes.length === 0 && !isLoading ? (
              <div className="text-center py-8 text-slate-500">
                <p>No notes found yet.</p>
                <p className="text-xs mt-1">Make sure someone has sent you a private transfer.</p>
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

                  return (
                    <div key={i} className="bg-slate-900 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-white font-medium">
                            {formatEther(BigInt(note.balance))} USDC
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
                        Chain: {note.chainId} | Leaf: {note.leafIndex}
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
              or you will lose access to payments.
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
