// src/services/hyperliquidOrders.ts
import { ethers } from 'ethers'
import { walletService } from './wallet'
import { hyperliquid } from './hyperliquid'

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

export class HyperliquidOrderService {
  private static readonly TESTNET_API = 'https://api.hyperliquid-testnet.xyz'
  private static readonly FIXED_USD_SIZE = 10 // $10 per prediction
  
  private activePositions: Map<string, PositionInfo> = new Map()
  private positionCallbacks: Map<string, (result: 'win' | 'loss', exitPrice: number) => void> = new Map()

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
   * Get asset configuration from metadata
   */
  private async getAssetConfig(assetSymbol: string) {
    try {
      const metadata = await hyperliquid.fetchPerpetualMeta()
      const asset = metadata.universe.find(a => a.name === assetSymbol)
      
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
   * Create EIP-712 signature for Hyperliquid order
   */
  private async signOrder(orderData: any): Promise<HyperliquidSignature> {
    const signer = walletService.getSigner()
    if (!signer) {
      throw new Error('No wallet connected')
    }

    // Hyperliquid EIP-712 domain
    const domain = {
      name: 'HyperliquidTestnet', // Use testnet domain
      version: '1',
      chainId: 421614, // Arbitrum testnet
      verifyingContract: '0x0000000000000000000000000000000000000000'
    }

    // Order type definition
    const types = {
      Order: [
        { name: 'asset', type: 'uint32' },
        { name: 'isBuy', type: 'bool' },
        { name: 'limitPx', type: 'uint64' },
        { name: 'sz', type: 'uint64' },
        { name: 'reduceOnly', type: 'bool' },
        { name: 'orderType', type: 'uint8' }
      ],
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' }
      ]
    }

    try {
      const signature = await walletService.signTypedData(domain, types, orderData)
      
      // Parse signature into r, s, v components
      const sig = ethers.Signature.from(signature)
      
      return {
        r: sig.r,
        s: sig.s,
        v: sig.v
      }
    } catch (error) {
      throw new Error(`Failed to sign order: ${error}`)
    }
  }

  /**
   * Place a prediction order
   */
  async placePredictionOrder(request: OrderRequest): Promise<OrderResponse> {
    try {
      const wallet = await walletService.getWalletInfo()
      if (!wallet?.isConnected) {
        throw new Error('Wallet not connected')
      }

      // Get asset configuration
      const assetConfig = await this.getAssetConfig(request.asset)
      
      // Calculate order parameters
      const orderSize = this.calculateOrderSize(request.price, assetConfig.szDecimals)
      const limitPrice = this.formatPrice(request.price, assetConfig.szDecimals)
      const cloid = this.generateCloid()
      
      // Create order object
      const order = {
        a: assetConfig.assetId, // Asset ID
        b: request.direction === 'up', // isBuy (true for UP/LONG)
        p: limitPrice, // Limit price
        s: orderSize, // Size
        r: false, // reduceOnly (false for opening position)
        t: { limit: { tif: "Ioc" } }, // IOC order type
        c: cloid // Client order ID
      }

      // Create signature data
      const orderData = {
        asset: assetConfig.assetId,
        isBuy: request.direction === 'up',
        limitPx: Math.round(parseFloat(limitPrice) * 1e6), // Convert to uint64
        sz: Math.round(parseFloat(orderSize) * Math.pow(10, assetConfig.szDecimals)),
        reduceOnly: false,
        orderType: 2 // IOC type
      }

      // Sign the order
      const signature = await this.signOrder(orderData)

      // Prepare exchange request
      const exchangeRequest = {
        type: 'order',
        orders: [order],
        grouping: 'na',
        nonce: Date.now(),
        signature: signature
      }

      // Send order to Hyperliquid
      const response = await fetch(`${HyperliquidOrderService.TESTNET_API}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exchangeRequest)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.status !== 'ok') {
        throw new Error(`Order failed: ${JSON.stringify(result)}`)
      }

      // Process order response
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
   * Get current market prices
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
}

// Global order service instance
export const hyperliquidOrders = new HyperliquidOrderService()