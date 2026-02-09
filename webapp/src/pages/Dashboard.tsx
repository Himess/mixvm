import { usePrivateUSDC } from '../hooks/usePrivateUSDC'
import { useBalance } from 'wagmi'
import { formatEther } from 'viem'
import { useSDKStore } from '../lib/store'

function Dashboard() {
  const {
    isConnected,
    isInitialized,
    privateBalance,
    formattedBalance,
    transactions,
    notes,
    contractAddress,
    address,
  } = usePrivateUSDC()

  const reset = useSDKStore((state) => state.reset)

  // Get public wallet balance
  const { data: walletBalance } = useBalance({
    address: address as `0x${string}`,
  })

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="card max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Welcome to MixVM</h2>
          <p className="text-slate-400 mb-6">
            Connect your wallet to access your private USDC balance and start making
            private transactions.
          </p>
          <p className="text-sm text-slate-500">
            Your privacy, your control.
          </p>
        </div>
      </div>
    )
  }

  // Format recent transactions for display
  const recentActivity = transactions.slice(0, 5).map((tx) => ({
    type: tx.type.charAt(0).toUpperCase() + tx.type.slice(1),
    amount: tx.type === 'deposit' || tx.type === 'receive'
      ? `+${(Number(tx.amount) / 1e18).toFixed(4)}`
      : `-${(Number(tx.amount) / 1e18).toFixed(4)}`,
    date: new Date(tx.timestamp).toLocaleDateString(),
    status: tx.status.charAt(0).toUpperCase() + tx.status.slice(1),
    txHash: tx.txHash,
  }))

  return (
    <div className="space-y-8">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Wallet Balance (Public) */}
        <div className="card">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-sm font-medium text-slate-400 mb-2">Wallet Balance</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">
                  {walletBalance ? parseFloat(formatEther(walletBalance.value)).toFixed(4) : '0.00'}
                </span>
                <span className="text-lg text-slate-400">USDC</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">Public (available for deposit)</p>
            </div>
          </div>
        </div>

        {/* Private Balance */}
        <div className="card bg-gradient-to-br from-green-900/20 to-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-sm font-medium text-slate-400 mb-2">Private Balance</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-green-400">{formattedBalance}</span>
                <span className="text-lg text-slate-400">USDC</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                {notes.length} note{notes.length !== 1 ? 's' : ''} in privacy pool
              </p>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                isInitialized ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isInitialized ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                {isInitialized ? 'Connected' : 'Initializing...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/deposit" className="card hover:bg-slate-700 transition-colors group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-white group-hover:text-primary-400">Deposit</h3>
              <p className="text-sm text-slate-400">Add funds to private pool</p>
            </div>
          </div>
        </a>

        <a href="/send" className="card hover:bg-slate-700 transition-colors group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-white group-hover:text-primary-400">Send</h3>
              <p className="text-sm text-slate-400">Private transfer to anyone</p>
            </div>
          </div>
        </a>

        <a href="/withdraw" className="card hover:bg-slate-700 transition-colors group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V4m-8 8h16" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-white group-hover:text-primary-400">Withdraw</h3>
              <p className="text-sm text-slate-400">Exit to public address</p>
            </div>
          </div>
        </a>
      </div>

      {/* Contract Info */}
      <div className="card bg-slate-800/50">
        <h3 className="text-sm font-medium text-slate-400 mb-2">Contract</h3>
        <code className="text-xs text-primary-400 break-all">{contractAddress}</code>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-medium text-white mb-4">Recent Activity</h2>
        {recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-slate-700 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    tx.type === 'Deposit' ? 'bg-green-500/20' :
                    tx.type === 'Send' || tx.type === 'Withdraw' ? 'bg-orange-500/20' : 'bg-primary-500/20'
                  }`}>
                    <span className={`text-lg ${
                      tx.type === 'Deposit' ? 'text-green-500' :
                      tx.type === 'Send' || tx.type === 'Withdraw' ? 'text-orange-500' : 'text-primary-500'
                    }`}>
                      {tx.amount.startsWith('+') ? '+' : '-'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-white">{tx.type}</p>
                    <p className="text-sm text-slate-400">{tx.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${tx.amount.startsWith('+') ? 'text-green-400' : 'text-orange-400'}`}>
                    {tx.amount} USDC
                  </p>
                  <p className={`text-sm ${
                    tx.status === 'Confirmed' ? 'text-green-500' :
                    tx.status === 'Pending' ? 'text-yellow-500' : 'text-red-500'
                  }`}>{tx.status}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-400">No transactions yet</p>
            <p className="text-sm text-slate-500 mt-1">Make your first deposit to get started</p>
          </div>
        )}
      </div>

      {/* Notes Debug (Development only) */}
      {notes.length > 0 && (
        <div className="card bg-slate-900">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Your Notes (Debug)</h3>
          <div className="space-y-2">
            {notes.map((note, i) => (
              <div key={i} className="text-xs font-mono text-slate-500 p-2 bg-slate-800 rounded">
                <div>Leaf #{note.leafIndex}</div>
                <div className="truncate">Balance: {(Number(note.balance) / 1e18).toFixed(6)} USDC</div>
                <div className="truncate">Commitment: {note.commitment.slice(0, 20)}...</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              if (window.confirm('Eski notlar silinecek. Yeni deposit yapmaniz gerekecek. Emin misiniz?')) {
                reset()
                window.location.reload()
              }
            }}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
          >
            Clear Old Notes (Fix Transfer Bug)
          </button>
        </div>
      )}
    </div>
  )
}

export default Dashboard
