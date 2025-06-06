// src/config/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { arbitrum } from 'wagmi/chains'
import { Chain } from 'viem'



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
  chains: [arbitrumTestnet, arbitrum],
  ssr: false, // Next.js SSR disabled for client-side wallet
})

