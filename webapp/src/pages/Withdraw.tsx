import { useState } from 'react'
import { parseUnits } from 'viem'
import { usePrivateUSDC } from '../hooks/usePrivateUSDC'

function Withdraw() {
  const {
    isConnected,
    isLoading,
    error,
    address,
    formattedBalance,
    notes,
    withdraw,
    usdcDecimals,
  } = usePrivateUSDC()

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [useConnectedWallet, setUseConnectedWallet] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [txResult, setTxResult] = useState<{ txHash: string } | null>(null)

  const handleWithdraw = async () => {
    const targetAddress = useConnectedWallet ? address : recipient
    if (!targetAddress || !amount || parseFloat(amount) <= 0) return

    setLocalError(null)
    setTxResult(null)

    try {
      // Use correct decimals for USDC (6 decimals)
      const amountWei = parseUnits(amount, usdcDecimals)
      const result = await withdraw(amountWei, targetAddress)
      if (result) {
        setTxResult({ txHash: result.txHash })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed'
      setLocalError(message)
    }
  }

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to withdraw.</p>
      </div>
    )
  }

  // Check if user has any private balance
  const totalBalance = notes.reduce((sum, note) => {
    try {
      return sum + BigInt(note.balance || '0')
    } catch {
      return sum
    }
  }, 0n)
  const hasBalance = totalBalance > 0n

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Withdraw</h1>

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

        {/* Recipient Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Recipient
          </label>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                checked={useConnectedWallet}
                onChange={() => setUseConnectedWallet(true)}
                className="w-4 h-4 text-primary-500"
              />
              <span className="text-white">
                Connected wallet ({address?.slice(0, 6)}...{address?.slice(-4)})
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                checked={!useConnectedWallet}
                onChange={() => setUseConnectedWallet(false)}
                className="w-4 h-4 text-primary-500"
              />
              <span className="text-white">Custom address</span>
            </label>
          </div>

          {!useConnectedWallet && (
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="input w-full mt-3"
              disabled={isLoading}
            />
          )}
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

        {/* Privacy Warning */}
        <div className="bg-orange-500/10 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-orange-400 mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Privacy Notice</span>
          </div>
          <p className="text-sm text-slate-300">
            Withdrawal destination address will be visible on-chain.
            For maximum privacy, consider using a fresh address.
          </p>
        </div>

        {/* Circuit Warning */}
        <div className="bg-yellow-500/10 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Circuit Required</span>
          </div>
          <p className="text-sm text-slate-300">
            Withdrawals require ZK proof generation.
            Circuit files (withdraw.wasm, .zkey) must be configured.
          </p>
        </div>

        {/* Error Display */}
        {(error || localError) && (
          <div className="mb-4 p-4 bg-red-500/10 rounded-lg">
            <p className="text-red-400 text-sm">{error || localError}</p>
          </div>
        )}

        {/* Withdraw Button */}
        <button
          onClick={handleWithdraw}
          disabled={isLoading || !hasBalance || !amount || parseFloat(amount) <= 0 || (!useConnectedWallet && !recipient)}
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
            'Withdraw'
          )}
        </button>

        {/* Success Result */}
        {txResult && (
          <div className="mt-4 p-4 bg-green-500/10 rounded-lg">
            <p className="text-green-400 text-sm font-medium">Withdrawal successful!</p>
            <p className="text-slate-400 text-xs mt-1 break-all">
              TX: {txResult.txHash}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Withdraw
