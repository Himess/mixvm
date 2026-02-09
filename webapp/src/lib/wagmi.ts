import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, baseSepolia } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

// Define Arc Testnet chain
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: { http: ['https://arc-testnet.drpc.org'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.network' },
  },
  testnet: true,
} as const

// Create wagmi config
export const config = createConfig({
  chains: [arcTestnet, baseSepolia, sepolia],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId: 'YOUR_WALLET_CONNECT_PROJECT_ID', // Replace with actual project ID
    }),
  ],
  transports: {
    [arcTestnet.id]: http(),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
  },
})

// Contract addresses - Using PrivateCCTPBridge as the main entry point (CCTP V2 + ERC-20 Wrapper - Jan 2026)
export const CONTRACTS = {
  arcTestnet: {
    // PrivateCCTPBridge - handles deposits, withdrawals, and cross-chain transfers
    privateUSDC: '0x75d0eeEE3288D875Dd60A0066437ed12445b0C03',
    transferVerifier: '0xb7438C9Cf91cE85f7C261048149d5aF03b9A12CC',
    withdrawVerifier: '0x45f043b1C830b4a43487B724A4cde7ae37Af4D7F',
    poseidonHasher: '0x8a228D723444105592b0d51cd342C9d28bC52bfa',
  },
}
