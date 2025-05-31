// src/config/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { arbitrum } from 'wagmi/chains'
import { Chain } from 'viem'

// Hyperliquid testnet chain (chain ID 1337)
// export const hyperliquidTestnet: Chain = {
//   id: 1337,
//   name: 'Hyperliquid Testnet',
//   nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
//   rpcUrls: {
//     default: { http: ['http://localhost:8545'] }, // Local RPC for testnet
//   },
//   blockExplorers: {
//     default: { name: 'Hyperliquid Explorer', url: 'https://app.hyperliquid-testnet.xyz' },
//   },
//   testnet: true,
// } as const

// Arbitrum Sepolia (backup/alternative)
export const arbitrumTestnet: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
  },
  testnet: true,
} as const

export const config = getDefaultConfig({
  appName: 'Hypurrekt',
  projectId: 'e4ad3f996b22e95e67357a293a238cb6', 
  chains: [ arbitrumTestnet],
  ssr: false, // Next.js SSR disabled for client-side wallet
})

// export const HYPERLIQUID_CHAIN_ID = 1337 // Hyperliquid testnet chain ID