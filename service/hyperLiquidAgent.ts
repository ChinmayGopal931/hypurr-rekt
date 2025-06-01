// src/services/hyperliquidAgent.ts
import { ethers } from 'ethers'
import * as hl from '@nktkas/hyperliquid'
import { HyperliquidSignature } from './hyperliquidOrders'

type ExchangeClient = hl.ExchangeClient

export interface AgentWallet {
  address: string
  privateKey: string
  isApproved: boolean
  exchangeClient?: ExchangeClient
}

export class HyperliquidAgentService {
  private useTestnet: boolean
  private agentWallet: AgentWallet | null = null
  private transport: hl.HttpTransport
  private infoClient: hl.InfoClient
  private baseUrl: string

  constructor(useTestnet: boolean = true) {
    this.useTestnet = useTestnet
    this.baseUrl = useTestnet 
      ? 'https://api.hyperliquid-testnet.xyz' 
      : 'https://api.hyperliquid.xyz'
    
    // Create transport with the correct base URL
    this.transport = new hl.HttpTransport()
    
    // Initialize info client with the transport
    this.infoClient = new hl.InfoClient({
      transport: this.transport
    })
  }

  /**
   * Generate a new agent wallet
   */
  generateAgentWallet(): AgentWallet {
    const wallet = ethers.Wallet.createRandom()
    
    const agentWallet: AgentWallet = {
      address: wallet.address.toLowerCase(),
      privateKey: wallet.privateKey,
      isApproved: false,
      exchangeClient: new hl.ExchangeClient({
        wallet: new ethers.Wallet(wallet.privateKey),
        transport: this.transport
      })
    }

    this.agentWallet = agentWallet
    console.log('Generated new agent wallet:', agentWallet.address)
    return agentWallet
  }

  /**
   * Get or create agent wallet
   */
  getAgentWallet(): AgentWallet {
    if (!this.agentWallet) {
      console.log('❌ Agent wallet not found, generating new one...')
      return this.generateAgentWallet()
    }
    
    // Ensure exchange client is initialized
    if (!this.agentWallet.exchangeClient) {
      this.agentWallet.exchangeClient = new hl.ExchangeClient({
        wallet: new ethers.Wallet(this.agentWallet.privateKey),
        transport: this.transport
      })
    }
    
    console.log('✅ Agent wallet found:', this.agentWallet.address)
    return this.agentWallet
  }

  /**
   * Sign user-signed action (FINAL FIX - matches Python SDK source exactly)
   */
  async approveAgent(
    agentWallet: AgentWallet,
    masterSigner: any, // Should be a signer that can sign EIP-712 messages
    agentName: string = 'Hyper-rektAgent'
  ): Promise<{ success: boolean; error?: string; needsDeposit?: boolean }> {
    try {
      if (!agentWallet.exchangeClient) {
        throw new Error('Agent wallet not properly initialized')
      }

      console.log('🔐 Approving agent:', {
        agentAddress: agentWallet.address,
        agentName,
        network: this.useTestnet ? 'testnet' : 'mainnet'
      })

      // First, ensure the agent wallet is registered with Hyperliquid
      const registerResponse = await fetch(`${this.baseUrl}/register_agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentAddress: agentWallet.address,
          agentName,
          nonce: Date.now()
        })
      });

      if (!registerResponse.ok) {
        const error = await registerResponse.json().catch(() => ({}));
        console.error('❌ Failed to register agent wallet:', error);
        
        // If the wallet doesn't exist, we need to create it with a deposit
        if (registerResponse.status === 400 && error.message?.includes('does not exist')) {
          return { 
            success: false, 
            needsDeposit: true,
            error: 'You need to deposit funds to Hyperliquid first to create your account.'
          };
        }
        
        throw new Error(error.message || 'Failed to register agent wallet');
      }

      // Now approve the agent
      const result = await agentWallet.exchangeClient!.approveAgent({
        agentAddress: agentWallet.address as `0x${string}`,
        agentName
      });

      console.log('✅ Agent approval response:', result);
      
      if (result && typeof result === 'object' && 'status' in result && result.status === 'ok') {
        agentWallet.isApproved = true;
        console.log('✅ Agent approved successfully!');
        return { success: true };
      } else {
        const errorMessage = result && typeof result === 'object' 
          ? (result as any).message || 'Agent approval failed'
          : 'Agent approval failed';
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('❌ Error approving agent:', error)
      
      // Check for specific deposit requirement error
      if (error.message?.includes('Must deposit before performing actions')) {
        return { 
          success: false, 
          needsDeposit: true,
          error: 'You need to deposit funds to Hyperliquid before approving an agent wallet.'
        }
      }
      
      return { 
        success: false, 
        error: error.message || 'Failed to approve agent'
      }
    }
  }

  /**
   * Get the exchange client for the agent wallet
   * This can be used to make trades on behalf of the user after approval
   */
  getAgentExchangeClient(): ExchangeClient | null {
    if (!this.agentWallet?.exchangeClient) {
      console.error('Agent wallet not initialized')
      return null
    }
    return this.agentWallet.exchangeClient
  }

  /**
   * Place an order using the agent wallet
   */
  async placeOrder(
    orderParams: {
      asset: string;  // Asset symbol like 'BTC', 'ETH', etc.
      isBuy: boolean;
      price: string;
      size: string;
      reduceOnly?: boolean;
      isMarket: boolean;
      triggerPx: string;
      tpsl: "tp" | "sl";
    }
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.agentWallet?.exchangeClient) {
      return {
        success: false,
        error: 'Agent wallet not initialized'
      }
    }

    try {
      // Get the asset index from the symbol
      const meta = await this.infoClient.meta()
      console.log('Meta response:', JSON.stringify(meta, null, 2))
      
      if (!meta.universe || !Array.isArray(meta.universe)) {
        console.error('Invalid meta response structure:', meta)
        return {
          success: false,
          error: 'Invalid response from exchange'
        }
      }
      
      // Find the index of the asset in the universe array
      const assetIndex = meta.universe.findIndex((a: any) => a.name === orderParams.asset)
      
      if (assetIndex === -1) {
        return {
          success: false,
          error: `Asset ${orderParams.asset} not found`
        }
      }

      const order = {
        a: assetIndex,  // Use the array index as the asset index
        b: orderParams.isBuy,
        p: orderParams.price,
        s: orderParams.size,
        r: orderParams.reduceOnly || false,
        t: {
          trigger: {
            isMarket: orderParams.isMarket,
            triggerPx: orderParams.triggerPx,
            tpsl: orderParams.tpsl,
          },
        },
      }

      const result = await this.agentWallet.exchangeClient.order({
        orders: [order],
        grouping: 'na',
      })

      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      console.error('❌ Error placing order:', error)
      return {
        success: false,
        error: error.message || 'Failed to place order'
      }
    }
  }

  // /**
  //  * Construct phantom agent (from Python SDK)
  //  */
  // private constructPhantomAgent(hash: string, isMainnet: boolean): any {
  //   return {
  //     source: isMainnet ? 'a' : 'b',
  //     connectionId: hash
  //   }
  // }

  /**
   * Convert address to bytes
   */
  // private addressToBytes(address: string): Uint8Array {
  //   // Remove 0x prefix if present
  //   const hex = address.startsWith('0x') ? address.slice(2) : address
  //   return ethers.getBytes('0x' + hex)
  // }

  /**
   * Sign an L1 action in the standard format expected by Hyperliquid
   * @param action The action to sign
   * @param wallet The wallet or private key to sign with
   * @param vaultAddress Optional vault/subaccount address
   * @param nonce The nonce to use (should be current timestamp in milliseconds)
   * @returns The signature in { r, s, v } format
   */
  async signStandardL1Action(
    action: any,
    wallet: ethers.Wallet | string,
    vaultAddress: string | undefined,
    nonce: number
  ): Promise<HyperliquidSignature> {
    try {
      // Create a signer from the provided wallet or private key
      const signer = typeof wallet === 'string' 
        ? new ethers.Wallet(wallet)
        : wallet;
      
      // Create the payload to sign
      const payload = {
        action,
        nonce,
        ...(vaultAddress && { vaultAddress })
      };
      
      // Stringify with deterministic ordering
      const messageString = JSON.stringify(payload, Object.keys(payload).sort())
      
      console.log('🔐 Signing message:', messageString)
      
      // Sign the message
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes(messageString))
      const signature = await signer.signMessage(ethers.getBytes(messageHash))
      
      // Parse the signature into r, s, v components
      const sig = ethers.Signature.from(signature)
      
      console.log('✅ Standard L1 action signed successfully')
      return {
        r: sig.r,
        s: sig.s,
        v: sig.v
      }
    } catch (error) {
      console.error('❌ Error signing standard L1 action:', error)
      throw error
    }
  }
  
  /**
   * @deprecated Use signStandardL1Action instead
   */
  async signL1ActionWithAgent(
    payload: {
      action: any;
      nonce: number;
      vaultAddress?: string;
    }
  ): Promise<HyperliquidSignature> {
    console.warn('signL1ActionWithAgent is deprecated. Use signStandardL1Action instead.')
    const agentWallet = this.getAgentWallet()
    return this.signStandardL1Action(
      payload.action,
      agentWallet.privateKey, // Pass the private key as the wallet parameter
      payload.vaultAddress,
      payload.nonce
    )
  }

  /**
   * Check if agent is ready for trading
   */
  isAgentReady(): boolean {
    return !!(this.agentWallet && this.agentWallet.isApproved)
  }

  /**
   * Get agent address if available
   */
  getAgentAddress(): string | null {
    return this.agentWallet?.address || null
  }

  /**
   * Set network
   */
  setNetwork(useTestnet: boolean): void {
    this.useTestnet = useTestnet
  }

  /**
   * Save agent to localStorage (including unapproved agents)
   */
  saveAgent(masterAddress: string): void {
    if (this.agentWallet) {
      const agentData = {
        ...this.agentWallet,
        masterAddress: masterAddress.toLowerCase(),
        network: this.useTestnet ? 'testnet' : 'mainnet',
        createdAt: Date.now()
      }
      
      const storageKey = `hyperliquid_agent_${masterAddress.toLowerCase()}_${this.useTestnet ? 'testnet' : 'mainnet'}`
      
      try {
        localStorage.setItem(storageKey, JSON.stringify(agentData))
        console.log('✅ Agent saved to localStorage:', storageKey, 'Approved:', this.agentWallet.isApproved)
      } catch (error) {
        console.error('❌ Failed to save agent to localStorage:', error)
      }
    }
  }

  /**
   * Load agent from localStorage (optional)
   */
  loadAgent(masterAddress: string): AgentWallet | null {
    const storageKey = `hyperliquid_agent_${masterAddress.toLowerCase()}_${this.useTestnet ? 'testnet' : 'mainnet'}`
    
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const agentData = JSON.parse(saved)
        
        // Validate the saved data
        if (agentData.address && agentData.privateKey && agentData.network === (this.useTestnet ? 'testnet' : 'mainnet')) {
          this.agentWallet = {
            address: agentData.address,
            privateKey: agentData.privateKey,
            isApproved: agentData.isApproved || false
          }
          
          console.log('✅ Agent loaded from localStorage:', this.agentWallet.address)
          return this.agentWallet
        }
      }
    } catch (error) {
      console.error('❌ Error loading agent from localStorage:', error)
    }
    
    return null
  }

  /**
   * Clear agent data (for testing or reset)
   */
  clearAgent(masterAddress?: string): void {
    this.agentWallet = null
    
    if (masterAddress) {
      const storageKey = `hyperliquid_agent_${masterAddress.toLowerCase()}_${this.useTestnet ? 'testnet' : 'mainnet'}`
      try {
        localStorage.removeItem(storageKey)
        console.log('✅ Agent cleared from localStorage')
      } catch (error) {
        console.error('❌ Error clearing agent from localStorage:', error)
      }
    }
  }

  /**
   * Get agent status for debugging
   */
  getAgentStatus(): {
    exists: boolean
    approved: boolean
    address: string | null
    network: string
  } {
    return {
      exists: !!this.agentWallet,
      approved: this.agentWallet?.isApproved || false,
      address: this.agentWallet?.address || null,
      network: this.useTestnet ? 'testnet' : 'mainnet'
    }
  }
}

// Global agent service instance
export const hyperliquidAgent = new HyperliquidAgentService(true) // Default to testnet