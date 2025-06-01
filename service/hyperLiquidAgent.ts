// src/services/hyperliquidAgent.ts
import { ethers } from 'ethers'
import { encode as msgpackEncode } from '@msgpack/msgpack'

export interface AgentWallet {
  address: string
  privateKey: string
  isApproved: boolean
}

export interface AgentApprovalRequest {
  agentAddress: string
  agentName?: string // Optional name for the agent
}

export class HyperliquidAgentService {
  private static readonly TESTNET_API = 'https://api.hyperliquid-testnet.xyz'
  private static readonly MAINNET_API = 'https://api.hyperliquid.xyz'
  
  private useTestnet: boolean = true
  private agentWallet: AgentWallet | null = null

  constructor(useTestnet: boolean = true) {
    this.useTestnet = useTestnet
  }

  private getApiUrl(): string {
    return this.useTestnet ? HyperliquidAgentService.TESTNET_API : HyperliquidAgentService.MAINNET_API
  }

  /**
   * Generate a new agent wallet
   */
  generateAgentWallet(): AgentWallet {
    const wallet = ethers.Wallet.createRandom()
    
    const agentWallet: AgentWallet = {
      address: wallet.address.toLowerCase(),
      privateKey: wallet.privateKey,
      isApproved: false
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
      return this.generateAgentWallet()
    }
    return this.agentWallet
  }



/**
   * Sign user-signed action (FINAL FIX - matches Python SDK source exactly)
   * Key differences from previous attempts:
   * 1. Primary type includes namespace: "HyperliquidTransaction:ApproveAgent"
   * 2. Types DO NOT include signatureChainId
   * 3. Message to sign does NOT include signatureChainId
   * 4. SignatureChainId is used only for domain.chainId and API request
   */
private async signUserSignedAction(
  action: any,
  masterSignTypedData: any
): Promise<{ r: string; s: string; v: number }> {
  // Domain uses the signatureChainId (testnet chainId)
  const domain = {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: this.useTestnet ? 421614 : 42161, // This comes from signatureChainId
    verifyingContract: '0x0000000000000000000000000000000000000000'
  }

  // EIP-712 types EXACTLY from Python SDK - NO signatureChainId in types!
  const types = {
    'HyperliquidTransaction:ApproveAgent': [ // WITH namespace prefix
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'agentAddress', type: 'address' },
      { name: 'agentName', type: 'string' },
      { name: 'nonce', type: 'uint64' }
      // NOTE: signatureChainId is NOT in the types!
    ]
  }

  console.log('🔍 PYTHON SDK Signing domain:', domain)
  console.log('🔍 PYTHON SDK Signing message:', action)

  try {
    const signature = await masterSignTypedData({
      domain,
      types,
      primaryType: 'HyperliquidTransaction:ApproveAgent', // WITH namespace prefix
      message: action
    })

    console.log('🔍 PYTHON SDK Raw signature:', signature)

    const sig = ethers.Signature.from(signature)
    
    // Verify the signature recovery
    const recoveredAddress = ethers.verifyTypedData(domain, types, action, signature)
    console.log('🔍 PYTHON SDK Recovered address:', recoveredAddress)
    
    return {
      r: sig.r,
      s: sig.s,
      v: sig.v
    }
  } catch (error) {
    console.error('❌ PYTHON SDK Signing failed:', error)
    throw new Error(`Failed to sign agent approval: ${error}`)
  }
}

/**
 * Approve agent wallet (FINAL FIX - matches Python SDK exactly)
 */
async approveAgent(
  agentWallet: AgentWallet,
  masterSignTypedData: any,
  agentName: string = 'GameAgent'
): Promise<{ success: boolean; error?: string; needsDeposit?: boolean }> {
  try {
    const nonce = Date.now()
    
    // Create the message to sign (PYTHON SDK format - NO signatureChainId)
    const messageToSign = {
      hyperliquidChain: this.useTestnet ? 'Testnet' : 'Mainnet',
      agentAddress: agentWallet.address,
      agentName: agentName,
      nonce: nonce
      // NOTE: signatureChainId is NOT included in the message!
    }

    console.log('🔧 PYTHON SDK Signing message (exact format):', messageToSign)

    // Sign the message
    const signature = await this.signUserSignedAction(messageToSign, masterSignTypedData)

    // Create the action for the API request (includes signatureChainId for API)
    const action = {
      type: 'approveAgent',
      hyperliquidChain: this.useTestnet ? 'Testnet' : 'Mainnet',
      signatureChainId: this.useTestnet ? '0x66eee' : '0xa4b1', // Added for API request
      agentAddress: agentWallet.address,
      agentName: agentName,
      nonce: nonce
    }

    // Create the request structure matching Python SDK
    const approvalRequest = {
      action: action,
      nonce: nonce,
      signature: signature
    }

    console.log('🚀 PYTHON SDK Sending agent approval request:', {
      agentAddress: agentWallet.address,
      agentName: agentName,
      network: this.useTestnet ? 'testnet' : 'mainnet',
      requestStructure: 'Exact Python SDK format'
    })

    const response = await fetch(`${this.getApiUrl()}/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(approvalRequest)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Agent approval HTTP error:', errorText)
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const result = await response.json()
    console.log('📥 PYTHON SDK Agent approval response:', result)

    if (result.status === 'ok') {
      agentWallet.isApproved = true
      console.log('✅ PYTHON SDK Agent approved successfully!')
      return { success: true }
    } else {
      console.error('❌ PYTHON SDK Agent approval failed:', result)
      
      // Check for specific deposit requirement error
      if (result.response && result.response.includes('Must deposit before performing actions')) {
        return { 
          success: false, 
          needsDeposit: true,
          error: 'You need to deposit funds to Hyperliquid before approving an agent wallet.'
        }
      }
      
      return { 
        success: false, 
        error: result.response || 'Agent approval failed'
      }
    }
  } catch (error) {
    console.error('❌ PYTHON SDK Error approving agent:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Fixed action hash method using msgpack (matches Python SDK exactly)
 */
private actionHash(action: any, nonce: number, vaultAddress: string | null): string {
  try {
    console.log('🔍 Generating action hash for:', { action, nonce, vaultAddress })
    
    // Use msgpack to serialize action (exactly like Python SDK)
    const actionBytes = msgpackEncode(action)
    console.log('🔍 Action serialized with msgpack:', actionBytes)
    
    // Nonce as 8 bytes big endian (matching Python SDK)
    const nonceBytes = new ArrayBuffer(8)
    const nonceView = new DataView(nonceBytes)
    nonceView.setBigUint64(0, BigInt(nonce), false) // big endian
    
    let hashInput: Uint8Array
    
    if (vaultAddress === null) {
      // No vault address case
      hashInput = new Uint8Array(actionBytes.length + 8 + 1)
      hashInput.set(actionBytes, 0)
      hashInput.set(new Uint8Array(nonceBytes), actionBytes.length)
      hashInput[actionBytes.length + 8] = 0x00
    } else {
      // With vault address (trading on behalf of master account)
      const vaultBytes = this.addressToBytes(vaultAddress.toLowerCase())
      hashInput = new Uint8Array(actionBytes.length + 8 + 1 + vaultBytes.length)
      hashInput.set(actionBytes, 0)
      hashInput.set(new Uint8Array(nonceBytes), actionBytes.length)
      hashInput[actionBytes.length + 8] = 0x01
      hashInput.set(vaultBytes, actionBytes.length + 8 + 1)
    }
    
    // Hash using keccak256
    const hash = ethers.keccak256(hashInput)
    console.log('🔍 Final action hash:', hash)
    
    return hash
  } catch (error) {
    console.error('❌ Action hash generation failed:', error)
    throw error
  }
}

/**
 * Convert address to bytes (matches Python SDK)
 */
private addressToBytes(address: string): Uint8Array {
  // Remove 0x prefix if present
  const hex = address.startsWith('0x') ? address.slice(2) : address
  return ethers.getBytes('0x' + hex)
}

  /**
   * Construct phantom agent (from Python SDK)
   */
  private constructPhantomAgent(hash: string, isMainnet: boolean): any {
    return {
      source: isMainnet ? 'a' : 'b',
      connectionId: hash
    }
  }

  /**
   * Sign L1 action using agent wallet (with chainId 1337)
   */
  async signL1ActionWithAgent(
    action: any,
    nonce: number,
    vaultAddress: string | null = null
  ): Promise<{ r: string; s: string; v: number }> {
    if (!this.agentWallet || !this.agentWallet.isApproved) {
      throw new Error('Agent wallet not approved. Please approve the agent first.')
    }

    try {
      // Create action hash
      const hash = this.actionHash(action, nonce, vaultAddress)
      console.log('Action hash generated:', hash)

      // Construct phantom agent
      const phantomAgent = this.constructPhantomAgent(hash, !this.useTestnet)
      console.log('Phantom agent:', phantomAgent)

      // Create agent signer from private key
      const agentSigner = new ethers.Wallet(this.agentWallet.privateKey)
      console.log('Agent signer address:', agentSigner.address)

      // EIP-712 domain for agent signing (chainId 1337)
      const domain = {
        name: 'Exchange',
        version: '1',
        chainId: 1337, // This is the key - agents can sign with 1337
        verifyingContract: '0x0000000000000000000000000000000000000000'
      }

      const types = {
        Agent: [
          { name: 'source', type: 'string' },
          { name: 'connectionId', type: 'bytes32' }
        ]
      }

      console.log('Signing with domain:', domain)
      console.log('Signing phantom agent:', phantomAgent)

      // Sign with agent's private key using chainId 1337
      const signature = await agentSigner.signTypedData(domain, types, phantomAgent)
      const sig = ethers.Signature.from(signature)

      console.log('✅ Successfully signed L1 action with agent')

      return {
        r: sig.r,
        s: sig.s,
        v: sig.v
      }
    } catch (error) {
      console.error('❌ Failed to sign L1 action with agent:', error)
      throw new Error(`Failed to sign L1 action with agent: ${error}`)
    }
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
export const hyperliquidAgent = new HyperliquidAgentService(true)