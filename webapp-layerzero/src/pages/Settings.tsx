import { useState, useMemo } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { useSDKStore } from '../lib/store'
import { loadStealthKeys } from '../lib/stealth'

function Settings() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChain, chains } = useSwitchChain()
  const { notes, reset } = useSDKStore()
  const [relayerUrl, setRelayerUrl] = useState('http://localhost:3000')
  const [showExportModal, setShowExportModal] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)

  const exportData = useMemo(() => {
    if (!address) return null
    const keys = loadStealthKeys(address)
    if (!keys) return null
    return JSON.stringify({
      address,
      stealthKeys: {
        spendingPublicKey: Array.from(keys.spendingPublicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        viewingPublicKey: Array.from(keys.viewingPublicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        spendingPrivateKey: Array.from(keys.spendingPrivateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        viewingPrivateKey: Array.from(keys.viewingPrivateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      },
      notes: notes,
    }, null, 2)
  }, [address, notes])

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to access settings.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Network Settings */}
      <div className="card">
        <h2 className="text-lg font-medium text-white mb-4">Network</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Current Network
            </label>
            <select
              value={chainId}
              onChange={(e) => switchChain?.({ chainId: Number(e.target.value) })}
              className="input w-full"
            >
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-500">
            Chain ID: {chainId}
          </p>
        </div>
      </div>

      {/* Relayer Settings */}
      <div className="card">
        <h2 className="text-lg font-medium text-white mb-4">Relayer</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Relayer URL
            </label>
            <input
              type="text"
              value={relayerUrl}
              onChange={(e) => setRelayerUrl(e.target.value)}
              className="input w-full"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Connected</span>
          </div>
        </div>
      </div>

      {/* Key Management */}
      <div className="card">
        <h2 className="text-lg font-medium text-white mb-4">Key Management</h2>
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">Connected Wallet</p>
            <p className="text-white font-mono text-sm break-all">{address}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowExportModal(true)}
              className="btn-secondary flex-1"
            >
              Export Keys
            </button>
            <button className="btn-secondary flex-1">
              Import Keys
            </button>
          </div>

          <p className="text-sm text-orange-400">
            Warning: Never share your private keys. Export only for backup purposes.
          </p>
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <h2 className="text-lg font-medium text-white mb-4">Data Management</h2>
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">Stored Notes</p>
            <p className="text-white font-mono text-lg">{notes.length} note(s)</p>
          </div>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="btn-secondary w-full text-red-400 hover:text-red-300 border-red-500/50 hover:border-red-500"
          >
            Reset All Notes
          </button>

          <p className="text-sm text-orange-400">
            Warning: Resetting will remove all locally stored notes. Only do this if you deposited to the wrong contract or need to start fresh.
          </p>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h2 className="text-lg font-medium text-white mb-4">About</h2>
        <div className="space-y-2 text-sm text-slate-400">
          <p>MixVM Privacy Layer v0.1.0</p>
          <p>Compliant Cross-chain Private USDC</p>
          <a
            href="https://github.com/Himess/mixvm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300"
          >
            View on GitHub
          </a>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-white mb-4">Export Keys & Notes</h3>
            {exportData ? (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  Your stealth keys and note data. Keep this safe and never share it publicly.
                </p>
                <div className="bg-slate-900 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto">
                  <code className="text-xs text-slate-300 break-all whitespace-pre-wrap">
                    {exportData}
                  </code>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 mb-4">
                No stealth keys found for this wallet. Register your stealth keys first by making a deposit or using the Receive page.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowExportModal(false); setExportCopied(false) }}
                className="btn-secondary flex-1"
              >
                Close
              </button>
              {exportData && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(exportData)
                    setExportCopied(true)
                    setTimeout(() => setExportCopied(false), 2000)
                  }}
                  className="btn-primary flex-1"
                >
                  {exportCopied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-white mb-4">Reset All Notes?</h3>
            <p className="text-sm text-slate-400 mb-4">
              This will permanently delete all {notes.length} stored note(s) from your browser.
              Any private balance in notes that haven't been withdrawn will be lost.
            </p>
            <div className="bg-red-500/10 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-400">
                This action cannot be undone!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  reset()
                  setShowResetConfirm(false)
                }}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
