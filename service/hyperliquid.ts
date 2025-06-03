// src/service/hyperliquid.ts
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

// Order Book Interfaces
export interface OrderBookLevel {
  px: string  // price
  sz: string  // size
  n: number   // number of orders
}

export interface OrderBook {
  coin: string
  levels: [OrderBookLevel[], OrderBookLevel[]] // [bids, asks]
  time: number
}

export interface L2BookRequest {
  type: 'l2Book'
  coin: string
  nSigFigs?: number | null
  mantissa?: number
}

export interface L2BookMessage {
  channel: string
  data: {
    levels: [OrderBookLevel[], OrderBookLevel[]]
    coin: string
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
  private orderBookCallback: ((orderBook: OrderBook) => void) | null = null
  private currentOrderBookCoin: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

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
   * Fetch L2 order book snapshot
   */
  async fetchL2Book(coin: string, nSigFigs?: number | null, mantissa?: number): Promise<OrderBook> {
    try {
      const request: L2BookRequest = {
        type: 'l2Book',
        coin,
        ...(nSigFigs !== undefined && { nSigFigs }),
        ...(mantissa !== undefined && { mantissa })
      }

      const response = await fetch(`${this.getApiUrl()}/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch L2 book for ${coin}: ${response.status}`)
      }

      const data = await response.json()
      return {
        coin,
        levels: data.levels,
        time: Date.now()
      }
    } catch (error) {
      console.error(`Error fetching L2 book for ${coin}:`, error)
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

  /**
   * Subscribe to real-time order book updates via WebSocket
   */
  subscribeToL2Book(coin: string, callback: (orderBook: OrderBook) => void): void {
    // Set up order book callback
    this.orderBookCallback = callback
    this.currentOrderBookCoin = coin

    // Connect WebSocket if not already connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWebSocket()

      // Wait for connection then subscribe
      setTimeout(() => {
        this.sendL2BookSubscription(coin)
      }, 1000)
    } else {
      this.sendL2BookSubscription(coin)
    }
  }

  private sendL2BookSubscription(coin: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const subscription = {
        method: 'subscribe',
        subscription: { type: 'l2Book', coin }
      }
      this.ws.send(JSON.stringify(subscription))
      console.log(`📊 Subscribed to L2 book for ${coin}`)
    }
  }

  /**
   * Unsubscribe from order book updates
   */
  unsubscribeFromL2Book(coin: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const unsubscribe = {
        method: 'unsubscribe',
        subscription: { type: 'l2Book', coin }
      }
      this.ws.send(JSON.stringify(unsubscribe))
      console.log(`📊 Unsubscribed from L2 book for ${coin}`)
    }
    this.orderBookCallback = null
    this.currentOrderBookCoin = null
  }

  private connectWebSocket(): void {
    try {
      this.ws = new WebSocket(this.getWsUrl())

      this.ws.onopen = () => {
        console.log('Connected to Hyperliquid WebSocket')
        this.reconnectAttempts = 0

        // Subscribe to allMids feed if price callback exists
        if (this.priceCallback) {
          const subscription = {
            method: 'subscribe',
            subscription: { type: 'allMids' }
          }
          this.ws?.send(JSON.stringify(subscription))
        }

        // Subscribe to order book if callback exists
        if (this.orderBookCallback && this.currentOrderBookCoin) {
          this.sendL2BookSubscription(this.currentOrderBookCoin)
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          // Handle price feed updates
          if (message.channel === 'allMids' && message.data?.mids) {
            this.priceCallback?.(message.data.mids)
          }

          // Handle order book updates
          if (message.channel === 'l2Book' && message.data) {
            const orderBook: OrderBook = {
              coin: this.currentOrderBookCoin || '',
              levels: message.data.levels,
              time: Date.now()
            }
            this.orderBookCallback?.(orderBook)
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
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)

      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)

      setTimeout(() => {
        this.connectWebSocket()
      }, delay)
    } else {
      console.error('Max reconnection attempts reached')
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.priceCallback = null
    this.orderBookCallback = null
    this.currentOrderBookCoin = null
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