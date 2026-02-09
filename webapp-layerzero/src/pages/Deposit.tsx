import { useState, useEffect } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { useBalance, useSwitchChain } from 'wagmi'
import { usePrivateUSDC } from '../hooks/usePrivateUSDC'
import { CHAIN_CONFIGS } from '../lib/chains'

const SUPPORTED_CHAINS = Object.values(CHAIN_CONFIGS)

function Deposit() {
  const {
    isConnected,
    isLoading,
    error,
    formattedBalance,
    deposit,
    wrapUSDC,
    getUSDCBalance,
    contractAddress,
    usdcAddress,
    usdcDecimals,
    isNativeUSDC,
    address,
    chainId,
  } = usePrivateUSDC()
  const { switchChain } = useSwitchChain()
  const currentChainName = chainId && CHAIN_CONFIGS[chainId] ? CHAIN_CONFIGS[chainId].shortName : 'Unknown'

  // Get public wallet balance (native USDC on Arc - 18 decimals)
  const { data: walletBalance, refetch: refetchBalance } = useBalance({
    address: address as `0x${string}`,
  })

  // ERC-20 USDC balance (6 decimals)
  const [erc20Balance, setErc20Balance] = useState<bigint>(0n)

  const [amount, setAmount] = useState('')
  const [wrapAmount, setWrapAmount] = useState('')
  const [txResult, setTxResult] = useState<{
    txHash: string
    commitment: string
    leafIndex: number
  } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [showWrap, setShowWrap] = useState(false)

  // Fetch ERC-20 USDC balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (isConnected && getUSDCBalance) {
        const bal = await getUSDCBalance()
        setErc20Balance(bal)
      }
    }
    fetchBalance()
    // Refresh every 10 seconds
    const interval = setInterval(fetchBalance, 10000)
    return () => clearInterval(interval)
  }, [isConnected, getUSDCBalance])

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) return

    setLocalError(null)
    setTxResult(null)

    try {
      // Use 6 decimals for ERC-20 USDC
      const amountWei = parseUnits(amount, usdcDecimals)
      const result = await deposit(amountWei)
      setTxResult(result)
      setAmount('')
      // Refresh balances after deposit
      refetchBalance()
      const newBal = await getUSDCBalance()
      setErc20Balance(newBal)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed'
      setLocalError(message)
    }
  }

  const handleWrap = async () => {
    if (!wrapAmount || parseFloat(wrapAmount) <= 0) return

    setLocalError(null)

    try {
      // Native USDC has 18 decimals
      const amountWei = parseUnits(wrapAmount, 18)
      await wrapUSDC(amountWei)
      setWrapAmount('')
      setShowWrap(false)
      // Refresh balances
      refetchBalance()
      const newBal = await getUSDCBalance()
      setErc20Balance(newBal)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wrap failed'
      setLocalError(message)
    }
  }

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to deposit.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Deposit</h1>

      <div className="card">
        {/* Chain Selector */}
        <div className="mb-6 p-3 bg-slate-900 rounded-lg">
          <label className="block text-xs text-slate-400 mb-2">Deposit Chain</label>
          <div className="flex gap-2">
            {SUPPORTED_CHAINS.map((chain) => (
              <button
                key={chain.id}
                onClick={() => switchChain({ chainId: chain.id })}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chainId === chain.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {chain.shortName}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Active: <span className="text-primary-400">{currentChainName}</span>
          </p>
        </div>

        {/* Balances */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {/* Native USDC Balance */}
          <div className="p-3 bg-slate-900 rounded-lg">
            <p className="text-xs text-slate-400">Native USDC</p>
            <p className="text-lg font-bold text-white">
              {walletBalance ? parseFloat(formatUnits(walletBalance.value, 18)).toFixed(2) : '0.00'}
            </p>
            <p className="text-xs text-slate-500">18 decimals</p>
          </div>

          {/* ERC-20 USDC Balance */}
          <div className="p-3 bg-slate-900 rounded-lg border border-primary-500/30">
            <p className="text-xs text-slate-400">ERC-20 USDC</p>
            <p className="text-lg font-bold text-primary-400">
              {parseFloat(formatUnits(erc20Balance, 6)).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500">6 decimals</p>
          </div>

          {/* Private Balance */}
          <div className="p-3 bg-slate-900 rounded-lg">
            <p className="text-xs text-slate-400">Private</p>
            <p className="text-lg font-bold text-green-400">{formattedBalance}</p>
            <p className="text-xs text-slate-500">In pool</p>
          </div>
        </div>

        {/* Wrap Section */}
        {!isNativeUSDC && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-yellow-400">Step 1: Wrap Native USDC</p>
                <p className="text-xs text-slate-400">Convert native USDC (18 dec) to ERC-20 (6 dec)</p>
              </div>
              <button
                onClick={() => setShowWrap(!showWrap)}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                {showWrap ? 'Hide' : 'Show'}
              </button>
            </div>

            {showWrap && (
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  value={wrapAmount}
                  onChange={(e) => setWrapAmount(e.target.value)}
                  placeholder="Amount to wrap"
                  className="input flex-1 text-sm"
                  disabled={isLoading}
                  step="0.01"
                  min="0"
                />
                <button
                  onClick={handleWrap}
                  disabled={isLoading || !wrapAmount || parseFloat(wrapAmount) <= 0}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                >
                  {isLoading ? 'Wrapping...' : 'Wrap'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            {isNativeUSDC ? 'Amount (Native USDC)' : 'Step 2: Deposit Amount (ERC-20 USDC)'}
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input w-full text-lg"
            disabled={isLoading}
            step="0.01"
            min="0"
          />
          <p className="text-xs text-slate-500 mt-2">
            {isNativeUSDC
              ? 'Native USDC (18 decimals)'
              : `ERC-20 USDC (${usdcDecimals} decimals) - Available: ${parseFloat(formatUnits(erc20Balance, 6)).toFixed(2)}`
            }
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-slate-900 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-slate-400 mb-3">What happens:</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">1.</span>
              <span>Your USDC is transferred to the privacy pool</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">2.</span>
              <span>A private commitment is created for your balance</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">3.</span>
              <span>Only you can spend from this commitment</span>
            </li>
          </ul>
        </div>

        {/* Error Display */}
        {(error || localError) && (
          <div className="mb-4 p-4 bg-red-500/10 rounded-lg">
            <p className="text-red-400 text-sm">{error || localError}</p>
          </div>
        )}

        {/* Deposit Button */}
        <button
          onClick={handleDeposit}
          disabled={isLoading || !amount || parseFloat(amount) <= 0}
          className="btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            'Deposit'
          )}
        </button>

        {/* Success Result */}
        {txResult && (
          <div className="mt-4 p-4 bg-green-500/10 rounded-lg">
            <p className="text-green-400 text-sm font-medium mb-2">Deposit successful!</p>
            <div className="space-y-1 text-xs text-slate-400">
              <p className="break-all">
                <span className="text-slate-500">TX:</span> {txResult.txHash}
              </p>
              <p>
                <span className="text-slate-500">Leaf Index:</span> {txResult.leafIndex}
              </p>
              <p className="break-all">
                <span className="text-slate-500">Commitment:</span> {txResult.commitment.slice(0, 20)}...
              </p>
            </div>
          </div>
        )}

        {/* Contract Info */}
        <div className="mt-6 pt-4 border-t border-slate-700 space-y-1">
          <p className="text-xs text-slate-500">
            Bridge: <code className="text-primary-400">{contractAddress}</code>
          </p>
          {!isNativeUSDC && (
            <p className="text-xs text-slate-500">
              USDC: <code className="text-primary-400">{usdcAddress}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Deposit
