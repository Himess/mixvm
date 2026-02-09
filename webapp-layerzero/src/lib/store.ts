import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrivateNote {
  commitment: string
  balance: string
  randomness: string
  nullifierSecret: string
  leafIndex: number
  chainId?: number
}

interface Transaction {
  type: 'deposit' | 'transfer' | 'withdraw' | 'receive'
  amount: string
  txHash: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  recipient?: string
}

interface SDKState {
  // Connection state
  isInitialized: boolean
  isLoading: boolean
  error: string | null

  // Balance state
  privateBalance: string
  notes: PrivateNote[]

  // Transaction history
  transactions: Transaction[]

  // User keys (encrypted in real app)
  viewingPrivKey: string | null
  spendingPubKeyX: string | null
  spendingPubKeyY: string | null

  // Actions
  setInitialized: (initialized: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setPrivateBalance: (balance: string) => void
  setNotes: (notes: PrivateNote[]) => void
  addNote: (note: PrivateNote) => void
  removeNote: (commitment: string) => void
  addTransaction: (tx: Transaction) => void
  updateTransaction: (txHash: string, updates: Partial<Transaction>) => void
  setKeys: (viewing: string, spendingX: string, spendingY: string) => void
  clearKeys: () => void
  reset: () => void
}

const initialState = {
  isInitialized: false,
  isLoading: false,
  error: null,
  privateBalance: '0',
  notes: [],
  transactions: [],
  viewingPrivKey: null,
  spendingPubKeyX: null,
  spendingPubKeyY: null,
}

export const useSDKStore = create<SDKState>()(
  persist(
    (set) => ({
      ...initialState,

      setInitialized: (initialized) => set({ isInitialized: initialized }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      setPrivateBalance: (balance) => set({ privateBalance: balance }),

      setNotes: (notes) => set({ notes }),

      addNote: (note) =>
        set((state) => ({
          notes: [...state.notes, note],
          privateBalance: (
            BigInt(state.privateBalance) + BigInt(note.balance)
          ).toString(),
        })),

      removeNote: (commitment) =>
        set((state) => {
          const note = state.notes.find((n) => n.commitment === commitment)
          const newNotes = state.notes.filter((n) => n.commitment !== commitment)
          const newBalance = note
            ? (BigInt(state.privateBalance) - BigInt(note.balance)).toString()
            : state.privateBalance
          return { notes: newNotes, privateBalance: newBalance }
        }),

      addTransaction: (tx) =>
        set((state) => ({
          transactions: [tx, ...state.transactions].slice(0, 50), // Keep last 50
        })),

      updateTransaction: (txHash, updates) =>
        set((state) => ({
          transactions: state.transactions.map((tx) =>
            tx.txHash === txHash ? { ...tx, ...updates } : tx
          ),
        })),

      setKeys: (viewing, spendingX, spendingY) =>
        set({
          viewingPrivKey: viewing,
          spendingPubKeyX: spendingX,
          spendingPubKeyY: spendingY,
        }),

      clearKeys: () =>
        set({
          viewingPrivKey: null,
          spendingPubKeyX: null,
          spendingPubKeyY: null,
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'mixvm-sdk-storage',
      partialize: (state) => ({
        notes: state.notes,
        transactions: state.transactions,
        privateBalance: state.privateBalance,
        // Don't persist keys in localStorage for security
      }),
    }
  )
)
