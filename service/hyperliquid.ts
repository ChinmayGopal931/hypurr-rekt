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


export class HyperliquidService {
  private static readonly MAINNET_API = 'https://api.hyperliquid.xyz'
  private static readonly TESTNET_API = 'https://api.hyperliquid-testnet.xyz'
  private static readonly MAINNET_WS = 'wss://api.hyperliquid.xyz/ws'
  private static readonly TESTNET_WS = 'wss://api.hyperliquid-testnet.xyz/ws'

  public useTestnet: boolean
  private ws: WebSocket | null = null
  private connectionState: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' = 'DISCONNECTED';
  private connectionPromise: Promise<void> | null = null; // To chain connection attempts

  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeoutId: NodeJS.Timeout | null = null;

  // Store callbacks separately
  private priceUpdateCallback: ((prices: PriceFeed) => void) | null = null;
  private orderBookUpdateCallback: ((orderBook: OrderBook) => void) | null = null;
  private currentSubscribedOrderBookCoin: string | null = null;


  // Track desired subscriptions
  private activeSubscriptions = {
    allMids: false,
    l2BookCoin: null as string | null,
  };

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
  private _connect(): Promise<void> {
    if (this.connectionState === 'CONNECTED' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectionState === 'CONNECTING' && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionState = 'CONNECTING';
    // Clear any previous ws instance and its handlers before creating a new one
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.close();
      }
      this.ws = null;
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    console.log('🔌 [HyperliquidService] Attempting to connect WebSocket...');

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.getWsUrl());

        this.ws.onopen = () => {
          console.log('✅ [HyperliquidService] WebSocket Connected');
          this.connectionState = 'CONNECTED';
          this.reconnectAttempts = 0;

          // Send subscriptions based on active flags
          if (this.activeSubscriptions.allMids) {
            this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
            console.log('Sent subscribe for allMids on connect');
          }
          if (this.activeSubscriptions.l2BookCoin) {
            this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin: this.activeSubscriptions.l2BookCoin } }));
            console.log(`Sent subscribe for l2Book ${this.activeSubscriptions.l2BookCoin} on connect`);
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string);
            if (message.channel === 'allMids' && message.data?.mids) {
              this.priceUpdateCallback?.(message.data.mids);
            }
            if (message.channel === 'l2Book' && message.data && message.data.coin === this.currentSubscribedOrderBookCoin) {
              const orderBook: OrderBook = {
                coin: message.data.coin,
                levels: message.data.levels,
                time: Date.now(),
              };
              this.orderBookUpdateCallback?.(orderBook);
            }
          } catch (error) {
            console.error('[HyperliquidService] Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`💣 [HyperliquidService] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
          this.ws = null; // Ensure ws is nulled
          if (this.connectionState !== 'DISCONNECTED') { // Don't auto-reconnect if intentionally disconnected
            this.connectionState = 'RECONNECTING';
            this._attemptReconnect();
          } else {
            console.log("[HyperliquidService] WebSocket closed intentionally, no reconnect.");
          }
          // Do not reject the promise here, _attemptReconnect handles further actions.
        };

        this.ws.onerror = (error) => {
          console.error('❌ [HyperliquidService] WebSocket error:', error);
          // onerror is usually followed by onclose, which will trigger reconnect logic.
          // If connectionPromise is pending, reject it.
          if (this.connectionState === 'CONNECTING') {
            this.connectionState = 'DISCONNECTED'; // Or RECONNECTING if appropriate
            reject(new Error('WebSocket connection failed'));
          }
          // No need to call _attemptReconnect here as onclose will handle it.
        };
      } catch (error) {
        console.error('[HyperliquidService] Error instantiating WebSocket:', error);
        this.connectionState = 'DISCONNECTED';
        reject(error);
        this._attemptReconnect(); // Attempt to recover from instantiation error
      }
    });
    return this.connectionPromise;
  }

  private _attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.connectionState !== 'DISCONNECTED') {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Adjusted delay start
      console.log(`[HyperliquidService] Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = null;
        if (this.connectionState !== 'DISCONNECTED') { // Check again before connecting
          this._connect().catch(err => console.error("[HyperliquidService] Reconnect attempt failed:", err));
        }
      }, delay);
    } else if (this.connectionState !== 'DISCONNECTED') {
      console.error('[HyperliquidService] Max reconnection attempts reached.');
      this.connectionState = 'DISCONNECTED'; // Give up
    }
  }

  // --- Public Subscription Methods ---

  subscribeToAllMids(callback: (prices: PriceFeed) => void): () => void {
    console.log('[HyperliquidService] Request to subscribe to allMids');
    this.priceUpdateCallback = callback;
    this.activeSubscriptions.allMids = true;

    if (this.connectionState === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
      // If already connected, ensure subscription is sent
      this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
      console.log('Sent subscribe for allMids (already connected)');
    } else if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'RECONNECTING') {
      this._connect().catch(err => console.error("[HyperliquidService] Connection failed for allMids subscription:", err));
    }
    // else if CONNECTING, onopen will handle it.

    return () => this.unsubscribeFromAllMids();
  }

  unsubscribeFromAllMids(): void {
    console.log('[HyperliquidService] Request to unsubscribe from allMids');
    this.activeSubscriptions.allMids = false;
    this.priceUpdateCallback = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription: { type: 'allMids' } }));
      console.log('Sent unsubscribe for allMids');
    }
    this._checkAndDisconnectIfNoSubscriptions();
  }

  subscribeToL2Book(coin: string, callback: (orderBook: OrderBook) => void): () => void {
    console.log(`[HyperliquidService] Request to subscribe to L2Book for ${coin}`);
    this.orderBookUpdateCallback = callback;
    this.currentSubscribedOrderBookCoin = coin; // For message routing
    this.activeSubscriptions.l2BookCoin = coin;

    if (this.connectionState === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } }));
      console.log(`Sent subscribe for l2Book ${coin} (already connected)`);
    } else if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'RECONNECTING') {
      this._connect().catch(err => console.error(`[HyperliquidService] Connection failed for L2Book ${coin} subscription:`, err));
    }
    // else if CONNECTING, onopen will handle it.

    return () => this.unsubscribeFromL2Book(coin);
  }

  unsubscribeFromL2Book(coin: string): void {
    console.log(`[HyperliquidService] Request to unsubscribe from L2Book for ${coin}`);
    if (this.activeSubscriptions.l2BookCoin === coin) {
      this.activeSubscriptions.l2BookCoin = null;
      this.orderBookUpdateCallback = null;
      this.currentSubscribedOrderBookCoin = null;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription: { type: 'l2Book', coin } }));
        console.log(`Sent unsubscribe for l2Book ${coin}`);
      }
    }
    this._checkAndDisconnectIfNoSubscriptions();
  }

  private _checkAndDisconnectIfNoSubscriptions(): void {
    if (!this.activeSubscriptions.allMids && !this.activeSubscriptions.l2BookCoin) {
      console.log('[HyperliquidService] No active subscriptions. Disconnecting WebSocket.');
      this.connectionState = 'DISCONNECTED'; // Signal intentional disconnect
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      if (this.ws) {
        this.ws.onclose = () => { console.log("[HyperliquidService] WebSocket intentionally closed (no subs)."); this.ws = null; }; // Override onclose
        if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
          this.ws.close();
        }
      }
      this.connectionPromise = null; // Clear any pending connection promise
      this.reconnectAttempts = 0; // Reset reconnect attempts
    }
  }

  /**
   * Public method to fully disconnect and stop all activity.
   * Different from internal _checkAndDisconnect...
   */
  public forceDisconnect(): void {
    console.log('[HyperliquidService] Force disconnect requested.');
    this.activeSubscriptions.allMids = false;
    this.activeSubscriptions.l2BookCoin = null;
    this.priceUpdateCallback = null;
    this.orderBookUpdateCallback = null;
    this._checkAndDisconnectIfNoSubscriptions(); // This will now proceed to disconnect
  }
}

export const hyperliquid = new HyperliquidService(true);