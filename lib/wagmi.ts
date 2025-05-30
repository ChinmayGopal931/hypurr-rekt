// src/config/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { arbitrum, arbitrumSepolia } from 'wagmi/chains'

// Custom Arbitrum testnet for Hyperliquid
export const arbitrumTestnet = {
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
  appName: 'Hypurrekt - Price Pulse Rider',
  projectId: 'YOUR_PROJECT_ID', // Get from https://cloud.walletconnect.com
  chains: [arbitrumTestnet, arbitrum],
  ssr: false, // If using Next.js, set to true
})

export const HYPERLIQUID_CHAIN_ID = 421614 // Arbitrum testnet