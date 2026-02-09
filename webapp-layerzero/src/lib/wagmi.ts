import { http, createConfig } from 'wagmi'
import { sepolia, baseSepolia, arbitrumSepolia } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

// Create wagmi config for LayerZero bridge (Base Sepolia <-> Ethereum Sepolia)
export const config = createConfig({
  chains: [baseSepolia, sepolia, arbitrumSepolia],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId: 'YOUR_WALLET_CONNECT_PROJECT_ID', // Replace with actual project ID
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
})

// PrivateLZBridge v10 Contract addresses (Feb 2026)
export const CONTRACTS = {
  baseSepolia: {
    bridge: '0x4cDf8DB3B884418db41fc1Eb15b3152262979AF1',
    stealthRegistry: '0x5ceCfD0bF5E815D935E4b0b85F5a604B784CA6E5',
    transferVerifier: '0xE961c624EB7fAFC6Fdea184C5BeC768dA5db495B',
    withdrawVerifier: '0x4aC6108858A2ba9C715d3E1694d413b01919A043',
    poseidonHasher: '0xF900978c52C9773C40Df173802f66922D57FDCec',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  ethereumSepolia: {
    bridge: '0xBe5233d68db3329c62958157854e1FE483d1b4c9',
    transferVerifier: '0x1F17d25E82B24326D899Cc17b75F7FF3a263f56b',
    withdrawVerifier: '0x96B97C487506813689092b0DD561a2052E7b25C4',
    poseidonHasher: '0xD35f2b612F96149f9869d8Db2B0a63Bef523cb0b',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  arbitrumSepolia: {
    bridge: '0x976f28253965A5bA21ad8ada897CC8383cdF206F',
    transferVerifier: '0xA9FC0Ec2A133abFcf801d8ba4c4eb4fD0C0aF467',
    withdrawVerifier: '0x55B4BcCdeF026c8cbF5AB495A85aa28F235a4Fed',
    poseidonHasher: '0xB83e014c837763C4c86f21C194d7Fb613edFbE2b',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
}
