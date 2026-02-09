import { useState } from 'react'
import { formatEther } from 'viem'
import { useAccount } from 'wagmi'
import { useSDKStore } from '../lib/store'

interface NoteData {
  commitment: string
  balance: string
  randomness: string
  nullifierSecret: string
  leafIndex: number
}

function ImportNote() {
  const { isConnected } = useAccount()
  const { addNote, notes } = useSDKStore()

  const [noteJson, setNoteJson] = useState('')
  const [parsedNote, setParsedNote] = useState<NoteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const parseNoteData = (json: string): NoteData | null => {
    try {
      const data = JSON.parse(json)

      // Validate required fields
      if (!data.commitment || !data.balance || !data.randomness || !data.nullifierSecret) {
        throw new Error('Missing required fields')
      }

      // Validate types
      if (typeof data.commitment !== 'string' || !data.commitment.startsWith('0x')) {
        throw new Error('Invalid commitment format')
      }
      if (typeof data.balance !== 'string' || isNaN(Number(data.balance))) {
        throw new Error('Invalid balance format')
      }
      if (typeof data.randomness !== 'string') {
        throw new Error('Invalid randomness format')
      }
      if (typeof data.nullifierSecret !== 'string') {
        throw new Error('Invalid nullifierSecret format')
      }

      return {
        commitment: data.commitment,
        balance: data.balance,
        randomness: data.randomness,
        nullifierSecret: data.nullifierSecret,
        leafIndex: typeof data.leafIndex === 'number' ? data.leafIndex : 0,
      }
    } catch (err) {
      return null
    }
  }

  const handleParse = () => {
    setError(null)
    setParsedNote(null)
    setSuccess(false)

    if (!noteJson.trim()) {
      setError('Please paste the note data')
      return
    }

    const parsed = parseNoteData(noteJson)
    if (!parsed) {
      setError('Invalid note data format. Please check the JSON.')
      return
    }

    // Check if note already exists
    const exists = notes.some(n => n.commitment.toLowerCase() === parsed.commitment.toLowerCase())
    if (exists) {
      setError('This note has already been imported')
      return
    }

    setParsedNote(parsed)
  }

  const handleImport = () => {
    if (!parsedNote) return

    try {
      addNote(parsedNote)
      setSuccess(true)
      setNoteJson('')
      setParsedNote(null)
    } catch (err) {
      setError('Failed to import note')
    }
  }

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-400">Please connect your wallet to import notes.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Import Note</h1>

      <div className="card">
        {/* Info */}
        <div className="bg-slate-900 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-primary-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">How to Import</span>
          </div>
          <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
            <li>Get the note data from the sender</li>
            <li>Paste the JSON data below</li>
            <li>Click "Parse" to verify the data</li>
            <li>Click "Import" to add to your wallet</li>
          </ol>
        </div>

        {/* Note Data Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Note Data (JSON)
          </label>
          <textarea
            value={noteJson}
            onChange={(e) => setNoteJson(e.target.value)}
            placeholder='{"commitment": "0x...", "balance": "...", ...}'
            className="input w-full h-40 font-mono text-sm resize-none"
            disabled={success}
          />
        </div>

        {/* Parse Button */}
        {!parsedNote && !success && (
          <button
            onClick={handleParse}
            disabled={!noteJson.trim()}
            className="btn-primary w-full py-3 mb-4 disabled:opacity-50"
          >
            Parse Note Data
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Parsed Note Preview */}
        {parsedNote && !success && (
          <div className="mb-4 p-4 bg-slate-900 rounded-lg">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Note Preview</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount:</span>
                <span className="text-white font-medium">
                  {formatEther(BigInt(parsedNote.balance))} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Commitment:</span>
                <span className="text-slate-300 font-mono text-xs">
                  {parsedNote.commitment.slice(0, 10)}...{parsedNote.commitment.slice(-8)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Leaf Index:</span>
                <span className="text-slate-300">{parsedNote.leafIndex}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setParsedNote(null)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                Import Note
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="p-4 bg-green-500/10 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Note Imported!</span>
            </div>
            <p className="text-sm text-slate-300">
              The note has been added to your wallet. You can now withdraw or transfer these funds.
            </p>
            <button
              onClick={() => setSuccess(false)}
              className="mt-3 text-sm text-primary-400 hover:text-primary-300"
            >
              Import Another Note
            </button>
          </div>
        )}

        {/* Security Warning */}
        <div className="mt-6 p-4 bg-yellow-500/10 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Security Notice</span>
          </div>
          <p className="text-sm text-slate-300">
            Only import note data from trusted sources. Anyone with this data can spend the funds.
            The data is stored locally in your browser.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ImportNote
