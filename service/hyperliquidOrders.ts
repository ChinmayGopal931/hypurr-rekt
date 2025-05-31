// src/services/hyperliquidOrders.ts
import { ethers } from 'ethers'
import { hyperliquid } from './hyperliquid'
import { hyperliquidAgent, AgentWallet } from './hyperLiquidAgent'

export interface OrderRequest {
  asset: string
  direction: 'up' | 'down'
  price: number
  size: string
  timeWindow: number
}

export interface OrderResponse {
  success: boolean
  orderId?: string
  cloid?: string
  error?: string
  fillInfo?: {
    filled: boolean
    fillPrice?: number
    fillSize?: string
  }
}

export interface PositionInfo {
  orderId: string
  cloid: string
  asset: string
  direction: 'up' | 'down'
  entryPrice: number
  size: string
  timestamp: number
  timeWindow: number
  filled: boolean
  fillPrice?: number
  closed?: boolean
  result?: 'win' | 'loss'
  exitPrice?: number
}

export interface HyperliquidSignature {
  r: string
  s: string
  v: number
}

export interface AssetConfig {
  assetId: number
  szDecimals: number
  maxLeverage: number
}

// Wagmi/RainbowKit compatible signature function type
export type SignTypedDataFunction = (args: {
  domain: any
  types: any
  primaryType: string
  message: any
}) => Promise<string>

export class HyperliquidOrderService {
  private static readonly TESTNET_API = 'https://api.hyperliquid-testnet.xyz'
  private static readonly MAINNET_API = 'https://api.hyperliquid.xyz'
  private static readonly FIXED_USD_SIZE = 10 // $10 per prediction
  
  private useTestnet: boolean = true
  private activePositions: Map<string, PositionInfo> = new Map()
  private positionCallbacks: Map<string, (result: 'win' | 'loss', exitPrice: number) => void> = new Map()

  constructor(useTestnet: boolean = true) {
    this.useTestnet = useTestnet
  }

  private getApiUrl(): string {
    return this.useTestnet ? HyperliquidOrderService.TESTNET_API : HyperliquidOrderService.MAINNET_API
  }

  /**
   * Initialize agent wallet for the user
   */
  async initializeAgent(
    userAddress: string,
    masterSignTypedData: SignTypedDataFunction
  ): Promise<AgentWallet> {
    console.log('🔍 Checking for existing agent for user:', userAddress)
    
    // Try to load existing agent
    let agent = hyperliquidAgent.loadAgent(userAddress)
    
    if (!agent || !agent.isApproved) {
      console.log('🔧 No approved agent found, creating new one...')
      
      // Generate new agent
      agent = hyperliquidAgent.generateAgentWallet()
      console.log('✅ Generated new agent wallet:', agent.address)
      
      // Approve agent with master account
      console.log('🔍 Requesting agent approval from user...')
      const approved = await hyperliquidAgent.approveAgent(
        agent,
        masterSignTypedData,
        'GameAgent'
      )
      
      if (!approved) {
        throw new Error('Failed to approve agent wallet')
      }
      
      console.log('✅ Agent approved successfully!')
      
      // Save agent for future use
      hyperliquidAgent.saveAgent(userAddress)
      console.log('✅ Agent saved to localStorage')
    } else {
      console.log('✅ Using existing approved agent:', agent.address)
    }
    
    return agent
  }

  /**
   * Generate a unique client order ID
   */
  private generateCloid(): string {
    return ethers.randomBytes(16).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
  }

  /**
   * Calculate order size based on fixed USD amount
   */
  private calculateOrderSize(price: number, assetDecimals: number): string {
    const usdSize = HyperliquidOrderService.FIXED_USD_SIZE
    const assetSize = usdSize / price
    
    // Round to asset's decimal precision
    const rounded = Math.floor(assetSize * Math.pow(10, assetDecimals)) / Math.pow(10, assetDecimals)
    return rounded.toFixed(assetDecimals)
  }

  /**
   * Format price according to Hyperliquid rules
   */
  private formatPrice(price: number, assetDecimals: number): string {
    // Max 5 significant figures, respecting decimal constraints
    const maxDecimals = Math.max(0, 6 - assetDecimals) // 6 for perpetuals
    const rounded = Math.round(price * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals)
    return rounded.toString()
  }

  /**
   * Get asset configuration from metadata via direct API call
   */
  private async getAssetConfig(assetSymbol: string): Promise<AssetConfig> {
    try {
      const response = await fetch(`${this.getApiUrl()}/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'meta' })
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch perpetual metadata: ${response.status}`)
      }

      const metadata = await response.json()
      const asset = metadata.universe.find((a: any) => a.name === assetSymbol)
      
      if (!asset) {
        throw new Error(`Asset ${assetSymbol} not found`)
      }

      const assetId = metadata.universe.indexOf(asset) // Index in array = asset ID
      
      return {
        assetId,
        szDecimals: asset.szDecimals,
        maxLeverage: asset.maxLeverage || 1
      }
    } catch (error) {
      throw new Error(`Failed to get asset config: ${error}`)
    }
  }

  /**
   * Place a prediction order using agent wallet system
   */
  async placePredictionOrder(
    request: OrderRequest,
    signTypedDataAsync: SignTypedDataFunction,
    userAddress: string
  ): Promise<OrderResponse> {
    try {
      if (!userAddress) {
        throw new Error('Wallet not connected')
      }

      // Ensure address is lowercase (important for Hyperliquid)
      const address = userAddress.toLowerCase()

      // Initialize agent wallet (or use existing one)
      let agent: AgentWallet
      try {
        console.log('🔍 Initializing agent for user:', address)
        agent = await this.initializeAgent(address, signTypedDataAsync)
        console.log('✅ Agent initialized:', agent.address, 'Approved:', agent.isApproved)
      } catch (error) {
        console.error('❌ Agent initialization failed:', error)
        return {
          success: false,
          error: `Agent setup failed: ${error}`
        }
      }

      // Get asset configuration
      const assetConfig = await this.getAssetConfig(request.asset)
      
      // Calculate order parameters
      const orderSize = this.calculateOrderSize(request.price, assetConfig.szDecimals)
      const limitPrice = this.formatPrice(request.price, assetConfig.szDecimals)
      const cloid = this.generateCloid()
      
      // Create order object in Hyperliquid wire format
      const order = {
        a: assetConfig.assetId, // asset
        b: request.direction === 'up', // isBuy (true for UP/LONG)
        p: limitPrice, // price as string
        s: orderSize, // size as string  
        r: false, // reduceOnly (false for opening position)
        t: { limit: { tif: "Ioc" } }, // IOC order type
        c: cloid // client order ID
      }

      // Create the complete action
      const action = {
        type: 'order',
        orders: [order],
        grouping: 'na'
      }

      const nonce = Date.now()

      // Sign using agent wallet (can use chainId 1337)
      console.log('🔍 Signing order with agent...')
      const signature = await hyperliquidAgent.signL1ActionWithAgent(action, nonce, address)
      console.log('✅ Order signed with agent')

      // Prepare exchange request in API format
      const exchangeRequest = {
        action: action,
        nonce: nonce,
        signature: signature,
        vaultAddress: address // Trade on behalf of master account
      }

      console.log('Sending order request with agent:', {
        action: action,
        nonce: nonce,
        masterAddress: address,
        agentAddress: agent.address,
        cloid: cloid
      })

      // Send order to Hyperliquid exchange endpoint
      const response = await fetch(`${this.getApiUrl()}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exchangeRequest)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()

      if (result.status !== 'ok') {
        throw new Error(`Order failed: ${JSON.stringify(result)}`)
      }

      // Process order response based on API documentation
      const orderStatus = result.response?.data?.statuses?.[0]
      
      if (orderStatus?.filled) {
        // Order filled immediately
        const fillInfo = orderStatus.filled
        const orderId = fillInfo.oid.toString()
        
        // Create position tracking
        const position: PositionInfo = {
          orderId,
          cloid,
          asset: request.asset,
          direction: request.direction,
          entryPrice: parseFloat(fillInfo.avgPx),
          size: fillInfo.totalSz,
          timestamp: Date.now(),
          timeWindow: request.timeWindow,
          filled: true,
          fillPrice: parseFloat(fillInfo.avgPx)
        }

        this.activePositions.set(cloid, position)
        
        // Schedule auto-close
        this.scheduleAutoClose(cloid, request.timeWindow)
        
        return {
          success: true,
          orderId,
          cloid,
          fillInfo: {
            filled: true,
            fillPrice: parseFloat(fillInfo.avgPx),
            fillSize: fillInfo.totalSz
          }
        }
      } else if (orderStatus?.resting) {
        // Order is resting (shouldn't happen with IOC, but handle it)
        const orderId = orderStatus.resting.oid.toString()
        
        return {
          success: true,
          orderId,
          cloid,
          fillInfo: {
            filled: false
          }
        }
      } else {
        // Order rejected or failed
        return {
          success: false,
          error: `Order not filled: ${JSON.stringify(orderStatus)}`
        }
      }

    } catch (error: any) {
      console.error('Order placement failed:', error)
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      }
    }
  }

  /**
   * Cancel an order using agent wallet system
   */
  async cancelOrder(
    asset: string, 
    orderId: string,
    signTypedDataAsync: SignTypedDataFunction,
    userAddress: string
  ): Promise<boolean> {
    try {
      // Ensure agent is initialized
      const agent = await this.initializeAgent(userAddress, signTypedDataAsync)
      
      const assetConfig = await this.getAssetConfig(asset)
      
      const action = {
        type: 'cancel',
        cancels: [{
          a: assetConfig.assetId, // asset
          o: parseInt(orderId) // order id
        }]
      }

      const nonce = Date.now()
      const signature = await hyperliquidAgent.signL1ActionWithAgent(action, nonce, userAddress.toLowerCase())

      const cancelRequest = {
        action: action,
        nonce: nonce,
        signature: signature,
        vaultAddress: userAddress.toLowerCase()
      }

      const response = await fetch(`${this.getApiUrl()}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cancelRequest)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      return result.status === 'ok'
    } catch (error) {
      console.error('Order cancellation failed:', error)
      return false
    }
  }

  /**
   * Get current market prices via direct API
   */
  private async getCurrentPrices(): Promise<{ [asset: string]: number }> {
    return new Promise((resolve) => {
      let prices: { [asset: string]: number } = {}
      
      const handlePriceUpdate = (priceData: { [symbol: string]: string }) => {
        for (const [symbol, priceStr] of Object.entries(priceData)) {
          prices[symbol] = parseFloat(priceStr)
        }
        resolve(prices)
      }

      // Subscribe temporarily to get current prices
      hyperliquid.subscribeToAllMids(handlePriceUpdate)
      
      // Fallback timeout
      setTimeout(() => {
        resolve(prices)
      }, 5000)
    })
  }

  /**
   * Schedule automatic position closing
   */
  private scheduleAutoClose(cloid: string, timeWindow: number): void {
    setTimeout(async () => {
      await this.closePosition(cloid)
    }, timeWindow * 1000)
  }

  /**
   * Close a position and determine outcome
   */
  private async closePosition(cloid: string): Promise<void> {
    const position = this.activePositions.get(cloid)
    if (!position || position.closed) return

    try {
      // Get current market price
      const currentPrices = await this.getCurrentPrices()
      const currentPrice = currentPrices[position.asset]
      
      if (!currentPrice) {
        console.error(`No current price found for ${position.asset}`)
        return
      }

      // Determine win/loss
      const priceWentUp = currentPrice > position.entryPrice
      const won = (position.direction === 'up' && priceWentUp) || 
                  (position.direction === 'down' && !priceWentUp)

      // Update position
      position.closed = true
      position.result = won ? 'win' : 'loss'
      position.exitPrice = currentPrice

      // Notify callback
      const callback = this.positionCallbacks.get(cloid)
      if (callback) {
        callback(position.result, currentPrice)
        this.positionCallbacks.delete(cloid)
      }

      console.log(`Position ${cloid} closed:`, {
        asset: position.asset,
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        result: position.result
      })

    } catch (error) {
      console.error(`Failed to close position ${cloid}:`, error)
    }
  }

  /**
   * Register callback for position outcome
   */
  onPositionResult(cloid: string, callback: (result: 'win' | 'loss', exitPrice: number) => void): void {
    this.positionCallbacks.set(cloid, callback)
  }

  /**
   * Get all active positions
   */
  getActivePositions(): PositionInfo[] {
    return Array.from(this.activePositions.values()).filter(p => !p.closed)
  }

  /**
   * Get position by cloid
   */
  getPosition(cloid: string): PositionInfo | undefined {
    return this.activePositions.get(cloid)
  }

  /**
   * Clear completed positions (for cleanup)
   */
  clearCompletedPositions(): void {
    for (const [cloid, position] of this.activePositions.entries()) {
      if (position.closed) {
        this.activePositions.delete(cloid)
      }
    }
  }

  /**
   * Set network (testnet/mainnet)
   */
  setNetwork(useTestnet: boolean): void {
    this.useTestnet = useTestnet
  }
}

// Global order service instance
export const hyperliquidOrders = new HyperliquidOrderService(true) // Default to testnet