// src/service/websocketManager.ts
import { hyperliquid } from './hyperliquid'
import type { PriceFeed, OrderBook } from './hyperliquid'

type PriceCallback = (prices: PriceFeed) => void
type OrderBookCallback = (orderBook: OrderBook) => void

interface WebSocketSubscriber {
    id: string
    onPriceUpdate?: PriceCallback
    onOrderBookUpdate?: OrderBookCallback
}

class WebSocketManager {
    private static instance: WebSocketManager
    private subscribers = new Map<string, WebSocketSubscriber>()
    private _isConnected = false
    private connectionPromise: Promise<void> | null = null
    private priceCallbacks = new Map<string, PriceCallback>()
    private orderBookCallbacks = new Map<string, OrderBookCallback>()

    static getInstance(): WebSocketManager {
        if (!WebSocketManager.instance) {
            WebSocketManager.instance = new WebSocketManager()
        }
        return WebSocketManager.instance
    }

    // Public getter for connection status
    get isConnected(): boolean {
        return this._isConnected
    }

    async connect(): Promise<void> {
        // If already connected or connecting, return existing promise
        if (this._isConnected) return Promise.resolve()
        if (this.connectionPromise) return this.connectionPromise

        this.connectionPromise = new Promise((resolve) => {
            console.log('🔌 WebSocket Manager: Connecting...')

            hyperliquid.subscribeToAllMids((prices) => {
                // Notify all subscribers
                this.subscribers.forEach(subscriber => {
                    subscriber.onPriceUpdate?.(prices)
                })

                // Notify all price callbacks
                this.priceCallbacks.forEach(callback => {
                    callback(prices)
                })
            })

            this._isConnected = true
            console.log('✅ WebSocket Manager: Connected')
            resolve()
        })

        return this.connectionPromise
    }

    // Legacy method for backward compatibility
    subscribe(subscriberId: string, callbacks: Partial<WebSocketSubscriber>): () => void {
        console.log(`📊 WebSocket Manager: Subscriber ${subscriberId} registered`)

        this.subscribers.set(subscriberId, {
            id: subscriberId,
            ...callbacks
        })

        // Connect if this is the first subscriber
        if (this.subscribers.size === 1 && this.priceCallbacks.size === 0) {
            this.connect()
        }

        // Return unsubscribe function
        return () => {
            console.log(`📊 WebSocket Manager: Subscriber ${subscriberId} unregistered`)
            this.subscribers.delete(subscriberId)

            // Only disconnect if no subscribers left
            if (this.subscribers.size === 0 && this.priceCallbacks.size === 0) {
                this.disconnect()
            }
        }
    }

    // Event emitter style methods
    on(event: 'prices', callback: PriceCallback): void
    on(event: 'orderbook', callback: OrderBookCallback): void
    on(event: string, callback: any): void {
        if (event === 'prices') {
            const id = `price-${Date.now()}-${Math.random()}`
            this.priceCallbacks.set(id, callback)

            // Connect if this is the first listener
            if (this.priceCallbacks.size === 1 && this.subscribers.size === 0) {
                this.connect()
            }
        } else if (event === 'orderbook') {
            const id = `orderbook-${Date.now()}-${Math.random()}`
            this.orderBookCallbacks.set(id, callback)
        }
    }

    off(event: 'prices', callback: PriceCallback): void
    off(event: 'orderbook', callback: OrderBookCallback): void
    off(event: string, callback: any): void {
        if (event === 'prices') {
            // Find and remove the callback
            for (const [id, cb] of this.priceCallbacks.entries()) {
                if (cb === callback) {
                    this.priceCallbacks.delete(id)
                    break
                }
            }

            // Disconnect if no listeners left
            if (this.priceCallbacks.size === 0 && this.subscribers.size === 0) {
                this.disconnect()
            }
        } else if (event === 'orderbook') {
            // Find and remove the callback
            for (const [id, cb] of this.orderBookCallbacks.entries()) {
                if (cb === callback) {
                    this.orderBookCallbacks.delete(id)
                    break
                }
            }
        }
    }

    // Subscribe to prices (returns unsubscribe function)
    subscribeToPrices(callback: PriceCallback): () => void {
        const id = `price-${Date.now()}-${Math.random()}`
        this.priceCallbacks.set(id, callback)

        // Connect if this is the first subscriber
        if (this.priceCallbacks.size === 1 && this.subscribers.size === 0) {
            this.connect()
        }

        // Return unsubscribe function
        return () => {
            this.priceCallbacks.delete(id)

            // Disconnect if no subscribers left
            if (this.priceCallbacks.size === 0 && this.subscribers.size === 0) {
                this.disconnect()
            }
        }
    }

    subscribeToOrderBook(coin: string, callback: OrderBookCallback): () => void {
        hyperliquid.subscribeToL2Book(coin, callback)
        return () => hyperliquid.unsubscribeFromL2Book(coin)
    }

    private disconnect(): void {
        console.log('🔌 WebSocket Manager: No subscribers, disconnecting...')
        hyperliquid.disconnect()
        this._isConnected = false
        this.connectionPromise = null
    }

    // Force disconnect (for cleanup)
    forceDisconnect(): void {
        this.subscribers.clear()
        this.priceCallbacks.clear()
        this.orderBookCallbacks.clear()
        this.disconnect()
    }
}

export const wsManager = WebSocketManager.getInstance()