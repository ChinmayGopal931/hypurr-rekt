// src/services/hyperliquid.ts
export interface HyperliquidAsset {
  name: string
  szDecimals: number
  maxLeverage?: number
  index?: number
  tokenId?: string
}

export interface AssetMetadata {
  universe: HyperliquidAsset[]
}

export interface PriceFeed {
  [symbol: string]: string
}

export interface AllMidsMessage {
  channel: string
  data: {
    mids: PriceFeed
  }
}

export class HyperliquidService {
  private static readonly MAINNET_API = 'https://api.hyperliquid.xyz'
  private static readonly TESTNET_API = 'https://api.hyperliquid-testnet.xyz'
  private static readonly MAINNET_WS = 'wss://api.hyperliquid.xyz/ws'
  private static readonly TESTNET_WS = 'wss://api.hyperliquid-testnet.xyz/ws'

  private useTestnet: boolean
  private ws: WebSocket | null = null
  private priceCallback: ((prices: PriceFeed) => void) | null = null
  private reconnectAttempts = 0
  private isReconnecting = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private maxReconnectDelay = 30000 // Maximum delay between reconnect attempts (30 seconds)

  constructor(useTestnet = true) {
    this.useTestnet = useTestnet
  }

  private getApiUrl(): string {
    return this.useTestnet ? HyperliquidService.TESTNET_API : HyperliquidService.MAINNET_API
  }

  private getWsUrl(): string {
    return this.useTestnet ? HyperliquidService.TESTNET_WS : HyperliquidService.MAINNET_WS
  }

  /**
   * Fetch perpetual contracts metadata
   */
  async fetchPerpetualMeta(): Promise<AssetMetadata> {
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

      return await response.json()
    } catch (error) {
      console.error('Error fetching perpetual metadata:', error)
      throw error
    }
  }

  /**
   * Fetch spot assets metadata
   */
  async fetchSpotMeta(): Promise<AssetMetadata> {
    try {
      const response = await fetch(`${this.getApiUrl()}/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'spotMeta' })
      })
      console.log(response)

      if (!response.ok) {
        throw new Error(`Failed to fetch spot metadata: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching spot metadata:', error)
      throw error
    }
  }

  /**
   * Subscribe to real-time price feeds via WebSocket
   */
  subscribeToAllMids(callback: (prices: PriceFeed) => void): void {
    this.priceCallback = callback
    this.connectWebSocket()
  }

  private connectWebSocket(): void {
    try {
      this.ws = new WebSocket(this.getWsUrl())

      this.ws.onopen = () => {
        console.log('Connected to Hyperliquid WebSocket')

        // Reset reconnection state on successful connection
        this.reconnectAttempts = 0
        this.isReconnecting = false
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }

        // Subscribe to allMids feed after a small delay to ensure connection is fully established
        const subscription = {
          method: 'subscribe',
          subscription: { type: 'allMids' }
        }

        // Add a small delay to ensure WebSocket is fully in OPEN state
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(subscription))
            console.log('Successfully subscribed to allMids feed')
          } else {
            console.error('Failed to subscribe: WebSocket not in OPEN state')
          }
        }, 100)
      }

      this.ws.onmessage = (event) => {
        try {
          const message: AllMidsMessage = JSON.parse(event.data)

          if (message.channel === 'allMids' && message.data?.mids) {
            this.priceCallback?.(message.data.mids)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      this.ws.onclose = () => {
        console.log('WebSocket connection closed')
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

    } catch (error) {
      console.error('Error connecting to WebSocket:', error)
      this.attemptReconnect()
    }
  }

  private attemptReconnect(): void {
    // Prevent multiple reconnection attempts running simultaneously
    if (this.isReconnecting) {
      return
    }

    this.isReconnecting = true
    this.reconnectAttempts++

    // Calculate delay with exponential backoff, capped at maxReconnectDelay
    const delay = Math.min(1000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 10)), this.maxReconnectDelay)

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket()
      // If connectWebSocket fails, isReconnecting will remain true
      // It will be reset to false on successful connection in the onopen handler
    }, delay)
  }

  /**
   * Disconnect WebSocket and clean up resources
   */
  disconnect(): void {
    // Clear any pending reconnection attempt
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Reset reconnection state
    this.isReconnecting = false

    // Close the WebSocket connection if it exists
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.priceCallback = null
  }

  /**
   * Format price according to asset's szDecimals
   */
  formatPrice(price: number, szDecimals: number): string {
    // Price precision: up to 5 significant figures, no more than 6 decimal places
    const maxDecimals = Math.min(6, Math.max(0, 6 - szDecimals))
    const formatted = price.toExponential(maxDecimals).replace(/e\+?(-?\d+)/, `e${+RegExp.$1 - maxDecimals}`)
    return formatted.replace(/\.?0+$/, '')
  }

  /**
   * Calculate asset ID for perpetuals (index in universe array)
   */
  getAssetId(assetIndex: number, isSpot = false): number {
    if (isSpot) {
      return 10000 + assetIndex
    }
    return assetIndex
  }
}

// Singleton instance
export const hyperliquid = new HyperliquidService(true) // Use testnet by default