import { useState } from 'react'
import { parseUnits } from 'viem'
import { usePrivateUSDC } from '../hooks/usePrivateUSDC'

interface RecipientNoteData {
  commitment: string
  balance: string
  randomness: string
  nullifierSecret: string
  leafIndex: number
}

interface TransferResult {
  txHash: string
  recipientNoteData?: RecipientNoteData
  encryptedAnnounced?: boolean
}

function Send() {
  const {
    isConnected,
    isLoading,
    error,
    formattedBalance,
    notes,
    transfer,
    circuitsLoaded,
  } = usePrivateUSDC()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [txResult, setTxResult] = useState<TransferResult | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSend = async () => {
    if (!recipient || !amount || parseFloat(amount) <= 0) return

    setLocalError(null)
    setTxResult(null)
    setCopied(false)

    try {
      const amountWei = parseUnits(amount, 6)
      const result = await transfer(recipient, amountWei)
      setTxResult({
        txHash: result.txHash,
        recipientNoteData: result.recipientNoteData,
        encryptedAnnounced: result.encryptedAnnounced,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transfer failed'
      setLocalError(message)
    }
  }

  const copyNoteData = () => {
    if (!txResult?.recipientNoteData) return
    const noteDataStr = JSON.stringify(txResult.recipientNoteData, null, 2)
    navigator.clipboard.writeText(noteDataStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to send.</p>
      </div>
    )
  }

  const hasBalance = notes.length > 0 && BigInt(notes[0]?.balance || '0') > 0n

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Private Send</h1>

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

        {/* Recipient Input */}
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
            disabled={isLoading || !hasBalance}
          />
          <p className="text-xs text-slate-500 mt-1">
            Recipient must be registered in the privacy pool
          </p>
        </div>

        {/* Amount Input */}
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
            disabled={isLoading || !hasBalance}
            step="0.001"
            min="0"
          />
        </div>

        {/* Privacy Info */}
        <div className="bg-slate-900 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-primary-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="font-medium">Privacy Protected</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>- Sender address is hidden</li>
            <li>- Amount is encrypted</li>
            <li>- Uses stealth addresses</li>
            <li>- ZK proof verification</li>
          </ul>
        </div>

        {/* Circuit Status */}
        {circuitsLoaded ? (
          <div className="bg-green-500/10 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Circuits Ready</span>
            </div>
            <p className="text-sm text-slate-300">
              ZK proof generation enabled. Private transfers are ready.
            </p>
          </div>
        ) : (
          <div className="bg-yellow-500/10 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-yellow-400 mb-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="font-medium">Loading Circuits...</span>
            </div>
            <p className="text-sm text-slate-300">
              ZK circuit files are being loaded. Please wait...
            </p>
          </div>
        )}

        {/* Error Display */}
        {(error || localError) && (
          <div className="mb-4 p-4 bg-red-500/10 rounded-lg">
            <p className="text-red-400 text-sm">{error || localError}</p>
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={isLoading || !hasBalance || !recipient || !amount || parseFloat(amount) <= 0}
          className="btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating Proof...
            </span>
          ) : (
            'Send Privately'
          )}
        </button>

        {/* Success Result */}
        {txResult && (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-green-500/10 rounded-lg">
              <p className="text-green-400 text-sm font-medium">Transfer successful!</p>
              <p className="text-slate-400 text-xs mt-1 break-all">
                TX: {txResult.txHash}
              </p>
            </div>

            {/* Auto-announce success message */}
            {txResult.encryptedAnnounced && (
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">Auto-Scan Enabled!</span>
                </div>
                <p className="text-sm text-slate-300">
                  The recipient is registered on-chain. Their note data was encrypted and announced.
                  They can use the "Receive" page to automatically scan and import this transfer.
                </p>
              </div>
            )}

            {/* Recipient Note Data - Only show if auto-announce failed */}
            {txResult.recipientNoteData && !txResult.encryptedAnnounced && (
              <div className="p-4 bg-orange-500/10 rounded-lg border border-orange-500/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-orange-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">Manual Share Required!</span>
                  </div>
                  <button
                    onClick={copyNoteData}
                    className="px-3 py-1 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy Data'}
                  </button>
                </div>
                <p className="text-sm text-slate-300 mb-3">
                  The recipient is not registered on-chain. Share this data manually so they can import and withdraw.
                </p>
                <div className="bg-slate-900 rounded p-3 text-xs font-mono text-slate-400 overflow-x-auto">
                  <pre>{JSON.stringify(txResult.recipientNoteData, null, 2)}</pre>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Amount: {(Number(txResult.recipientNoteData.balance) / 1e6).toFixed(6)} USDC
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Send
