// // src/services/wallet.ts
// import { ethers } from 'ethers'

// export interface WalletInfo {
//   address: string
//   isConnected: boolean
//   chainId: number
//   balance?: string
// }

// export interface WalletError {
//   code: string
//   message: string
// }

// export class WalletService {
//   private provider: ethers.BrowserProvider | null = null
//   private signer: ethers.JsonRpcSigner | null = null

//   constructor() {
//     // Listen for account changes
//     if (typeof window !== 'undefined' && window.ethereum) {
//       window.ethereum.on('accountsChanged', this.handleAccountsChanged)
//       window.ethereum.on('chainChanged', this.handleChainChanged)
//       window.ethereum.on('disconnect', this.handleDisconnect)
//     }
//   }

//   /**
//    * Check if MetaMask or compatible wallet is available
//    */
//   isWalletAvailable(): boolean {
//     return typeof window !== 'undefined' && !!window.ethereum
//   }

//   /**
//    * Connect to user's wallet
//    */
//   async connectWallet(): Promise<WalletInfo> {
//     if (!this.isWalletAvailable()) {
//       throw new Error('No wallet found. Please install MetaMask or a compatible wallet.')
//     }

//     try {

//     if (!window.ethereum) {
//       throw new Error('No wallet found. Please install MetaMask or a compatible wallet.')
//     }
//       // Request account access
//       await window.ethereum.request({ method: 'eth_requestAccounts' })
      
//       this.provider = new ethers.BrowserProvider(window.ethereum)
//       this.signer = await this.provider.getSigner()
      
//       const address = await this.signer.getAddress()
//       const network = await this.provider.getNetwork()
//       const balance = await this.provider.getBalance(address)

//       return {
//         address,
//         isConnected: true,
//         chainId: Number(network.chainId),
//         balance: ethers.formatEther(balance)
//       }
//     } catch (error: any) {
//       if (error.code === 4001) {
//         throw new Error('User rejected the connection request')
//       }
//       throw new Error(`Failed to connect wallet: ${error.message}`)
//     }
//   }

//   /**
//    * Get current wallet info without requesting connection
//    */
//   async getWalletInfo(): Promise<WalletInfo | null> {
//     if (!this.isWalletAvailable()) return null

//     try {

//     if (!window.ethereum) {
//         throw new Error('No wallet found. Please install MetaMask or a compatible wallet.')
//     }
//       const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      
//       if (accounts.length === 0) {
//         return { address: '', isConnected: false, chainId: 0 }
//       }

//       if (!this.provider) {
//         this.provider = new ethers.BrowserProvider(window.ethereum)
//       }

//       const network = await this.provider.getNetwork()
//       const balance = await this.provider.getBalance(accounts[0])

//       return {
//         address: accounts[0],
//         isConnected: true,
//         chainId: Number(network.chainId),
//         balance: ethers.formatEther(balance)
//       }
//     } catch (error) {
//       console.error('Error getting wallet info:', error)
//       return null
//     }
//   }

//   /**
//    * Sign a message with the connected wallet
//    */
//   async signMessage(message: string): Promise<string> {
//     if (!this.signer) {
//       throw new Error('No wallet connected')
//     }

//     try {
//       return await this.signer.signMessage(message)
//     } catch (error: any) {
//       throw new Error(`Failed to sign message: ${error.message}`)
//     }
//   }

//   /**
//    * Sign typed data for Hyperliquid orders
//    */
//   async signTypedData(domain: any, types: any, value: any): Promise<string> {
//     if (!this.signer) {
//       throw new Error('No wallet connected')
//     }

//     try {
//       return await this.signer.signTypedData(domain, types, value)
//     } catch (error: any) {
//       throw new Error(`Failed to sign typed data: ${error.message}`)
//     }
//   }

//   /**
//    * Get the current signer for direct use
//    */
//   getSigner(): ethers.JsonRpcSigner | null {
//     return this.signer
//   }

//   /**
//    * Get the current provider
//    */
//   getProvider(): ethers.BrowserProvider | null {
//     return this.provider
//   }

//   /**
//    * Disconnect wallet
//    */
//   disconnect(): void {
//     this.provider = null
//     this.signer = null
//   }

//   // Event handlers
//   private handleAccountsChanged = (accounts: string[]) => {
//     if (accounts.length === 0) {
//       this.disconnect()
//     } else {
//       // Account changed, need to re-initialize
//       window.location.reload()
//     }
//   }

//   private handleChainChanged = (chainId: string) => {
//     // Chain changed, reload the page
//     window.location.reload()
//   }

//   private handleDisconnect = () => {
//     this.disconnect()
//   }

//   /**
//    * Clean up event listeners
//    */
//   cleanup(): void {
//     if (typeof window !== 'undefined' && window.ethereum) {
//       window.ethereum.removeListener('accountsChanged', this.handleAccountsChanged)
//       window.ethereum.removeListener('chainChanged', this.handleChainChanged)
//       window.ethereum.removeListener('disconnect', this.handleDisconnect)
//     }
//   }
// }

// // Global wallet instance
// export const walletService = new WalletService()

// // Type declarations for window.ethereum
// declare global {
//   interface Window {
//     ethereum?: {
//       request: (args: { method: string; params?: any[] }) => Promise<any>
//       on: (event: string, handler: (...args: any[]) => void) => void
//       removeListener: (event: string, handler: (...args: any[]) => void) => void
//       isMetaMask?: boolean
//     }
//   }
// }