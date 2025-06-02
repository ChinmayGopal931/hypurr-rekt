// src/hooks/useHyperliquid.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'
import { hyperliquid, HyperliquidAsset, PriceFeed } from '@/service/hyperliquid'
import { hyperliquidOrders, OrderRequest, OrderResponse, PositionInfo, RealTimePnLData } from '@/service/hyperliquidOrders'
import { useSwitchChain } from 'wagmi'

export interface Asset {
  id: string
  name: string
  symbol: string
  price: number
  change24h: number
}

export interface UseHyperliquidReturn {
  // Price feed data
  assets: Asset[]
  isLoading: boolean
  error: string | null
  isConnected: boolean
  lastUpdate: Date | null

  // Wallet & Orders
  address: string | undefined
  isWalletConnected: boolean
  placePredictionOrder: (request: OrderRequest) => Promise<OrderResponse>
  cancelOrder: (asset: string, orderId: string) => Promise<boolean>
  onPositionResult: (cloid: string, callback: (result: 'win' | 'loss', exitPrice: number) => void) => void
  getActivePositions: () => PositionInfo[]
  getPosition: (cloid: string) => PositionInfo | undefined
  clearCompletedPositions: () => void
  setNetwork: (useTestnet: boolean) => void

  // Current prices for order placement
  getCurrentPrice: (symbol: string) => number | null

  // P&L functionality
  getRealTimePnL: (userAddress: string) => Promise<RealTimePnLData | null>
  getAssetPnL: (userAddress: string, asset: string) => Promise<{
    unrealizedPnl: number
    returnOnEquity: number
    positionValue: number
  } | null>
  startPnLPolling: (
    userAddress: string,
    callback: (pnlData: RealTimePnLData | null) => void,
    intervalMs?: number
  ) => () => void

  // Position size calculation
  calculatePositionSize: (asset: string, leverage: number) => Promise<{
    usdValue: number
    assetSize: string
    currentPrice: number
  } | null>
}

export function useHyperliquid(): UseHyperliquidReturn {
  // Price feed state
  const [assets, setAssets] = useState<Asset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Wagmi hooks for wallet connectivity
  const { address, isConnected: isWalletConnected, chain } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChain: switchNetwork } = useSwitchChain()

  // Refs for price tracking
  const assetsMetadataRef = useRef<HyperliquidAsset[]>([])
  const previousPricesRef = useRef<{ [symbol: string]: number }>({})
  const currentPricesRef = useRef<{ [symbol: string]: number }>({})

  // Calculate 24h change (mock for now since we don't have historical data)
  const calculate24hChange = (symbol: string, currentPrice: number): number => {
    const previousPrice = previousPricesRef.current[symbol]
    if (!previousPrice) {
      // For first time, use a small random change to simulate 24h movement
      return (Math.random() - 0.5) * 10 // ±5% random change
    }

    // Calculate actual change from previous price
    return ((currentPrice - previousPrice) / previousPrice) * 100
  }

  // Get current price for a symbol
  const getCurrentPrice = useCallback((symbol: string): number | null => {
    return currentPricesRef.current[symbol] || null
  }, [])

  // Transform Hyperliquid data to our Asset format
  const transformAssets = (metadata: HyperliquidAsset[], prices: PriceFeed): Asset[] => {
    const popularAssets = ['BTC', 'ETH', 'SOL', 'ARB', 'DOGE'] // Priority assets to show first

    return metadata
      .filter(asset => prices[asset.name]) // Only include assets with price data
      .sort((a, b) => {
        // Sort by popularity first, then alphabetically
        const aIndex = popularAssets.indexOf(a.name)
        const bIndex = popularAssets.indexOf(b.name)

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1
        return a.name.localeCompare(b.name)
      })
      .map((asset) => {
        const currentPrice = parseFloat(prices[asset.name])
        const change24h = calculate24hChange(asset.name, currentPrice)

        // Store current price for calculations and order placement
        previousPricesRef.current[asset.name] = currentPrice
        currentPricesRef.current[asset.name] = currentPrice

        return {
          id: asset.name,
          name: getAssetDisplayName(asset.name),
          symbol: `${asset.name}-PERP`,
          price: currentPrice,
          change24h: change24h
        }
      })
      .slice(0, 8) // Show top 8 assets
  }

  // Get display name for asset
  const getAssetDisplayName = (symbol: string): string => {
    const names: { [key: string]: string } = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'SOL': 'Solana',
      'ARB': 'Arbitrum',
      'DOGE': 'Dogecoin',
      'AVAX': 'Avalanche',
      'LINK': 'Chainlink',
      'UNI': 'Uniswap'
    }
    return names[symbol] || symbol
  }

  // Calculate position size for a given asset and leverage
  // Updated calculatePositionSize function in useHyperliquid.ts for True Leverage

  // Calculate position size for a given asset and leverage (TRUE LEVERAGE)
  const calculatePositionSize = useCallback(async (asset: string, leverage: number): Promise<{
    usdValue: number
    assetSize: string
    currentPrice: number
  } | null> => {
    try {
      const currentPrice = getCurrentPrice(asset)
      if (!currentPrice) {
        console.error(`No current price available for ${asset}`)
        return null
      }

      // Get asset metadata for decimal precision
      const assetMetadata = assetsMetadataRef.current.find(a => a.name === asset)
      if (!assetMetadata) {
        console.error(`No metadata found for ${asset}`)
        return null
      }

      // ✅ TRUE LEVERAGE: $10 margin × leverage = position value
      const marginAmount = 10 // Fixed $10 margin
      const usdValue = marginAmount * leverage // True leverage calculation

      console.log(`💰 TRUE LEVERAGE calculation: $${marginAmount} margin × ${leverage}x = $${usdValue} position`)

      // Calculate asset size needed for this USD value
      const rawAssetSize = usdValue / currentPrice
      const assetDecimals = assetMetadata.szDecimals || 5
      const factor = Math.pow(10, assetDecimals)
      const roundedAssetSize = Math.floor(rawAssetSize * factor) / factor

      // Format as string
      let assetSize = roundedAssetSize.toString()
      if (assetSize.includes('.')) {
        assetSize = assetSize.replace(/\.?0+$/, '')
      }
      if (assetSize.endsWith('.')) {
        assetSize = assetSize.slice(0, -1)
      }
      if (!assetSize) {
        assetSize = '0'
      }

      console.log(`📊 TRUE LEVERAGE result: ${asset} @ $${currentPrice} with ${leverage}x = $${usdValue} (${assetSize} ${asset})`)
      console.log(`📊 Verification: ${assetSize} × $${currentPrice} = $${(parseFloat(assetSize) * currentPrice).toFixed(2)}`)

      return {
        usdValue,
        assetSize,
        currentPrice
      }
    } catch (error) {
      console.error('Error calculating TRUE LEVERAGE position size:', error)
      return null
    }
  }, [getCurrentPrice])

  // Updated order placement to include leverage validation
  const placePredictionOrder = useCallback(async (request: OrderRequest): Promise<OrderResponse> => {
    if (!isWalletConnected || !address) {
      return {
        success: false,
        error: 'Wallet not connected'
      }
    }

    if (!signTypedDataAsync) {
      return {
        success: false,
        error: 'Unable to sign transactions'
      }
    }

    // ✅ Validate leverage limits based on asset
    const maxLeverage = request.asset === 'BTC' ? 40 : request.asset === 'ETH' ? 25 : 50
    if (request.leverage && request.leverage > maxLeverage) {
      return {
        success: false,
        error: `Maximum leverage for ${request.asset} is ${maxLeverage}x`
      }
    }

    // Check if on correct network
    const expectedChainId = 421614 // Arbitrum Sepolia testnet
    if (chain?.id !== expectedChainId) {
      console.log(`Wrong network. Expected ${expectedChainId}, got ${chain?.id}`)

      if (switchNetwork) {
        try {
          await switchNetwork({ chainId: expectedChainId })
        } catch (error) {
          return {
            success: false,
            error: `Please switch to Arbitrum Sepolia testnet (ChainId: ${expectedChainId})`
          }
        }
      } else {
        return {
          success: false,
          error: `Please switch to Arbitrum Sepolia testnet (ChainId: ${expectedChainId})`
        }
      }
    }

    try {
      // Use current market price if not specified
      if (!request.price || request.price === 0) {
        const currentPrice = getCurrentPrice(request.asset)
        if (!currentPrice) {
          return {
            success: false,
            error: `No current price available for ${request.asset}`
          }
        }
        request.price = currentPrice
      }

      if (!address) {
        console.error('No wallet address available')
        return {
          success: false,
          error: 'No wallet address available. Please connect your wallet.'
        }
      }

      // ✅ Calculate expected position for logging
      const leverage = request.leverage || 20
      const expectedPositionValue = 10 * leverage
      const expectedAssetSize = expectedPositionValue / request.price

      console.log("Placing TRUE LEVERAGE prediction order:", {
        asset: request.asset,
        direction: request.direction,
        price: request.price,
        leverage: `${leverage}x`,
        marginRequired: '$10 USDC',
        expectedPositionValue: `$${expectedPositionValue}`,
        expectedAssetSize: expectedAssetSize.toFixed(6),
        timeWindow: request.timeWindow,
        walletAddress: address ? `${address.substring(0, 6)}...${address.substring(38)}` : 'none'
      })

      try {
        // Use agent system for order placement
        const result = await hyperliquidOrders.placePredictionOrder(
          request,
          signTypedDataAsync,
          address
        )
        console.log('TRUE LEVERAGE order result:', result)
        return result
      } catch (error) {
        console.error('Error in TRUE LEVERAGE placePredictionOrder:', error)
        throw error
      }
    } catch (error: any) {
      console.error('TRUE LEVERAGE order placement failed:', error)
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      }
    }
  }, [isWalletConnected, address, signTypedDataAsync, getCurrentPrice, chain?.id, switchNetwork])
  // Cancel order function using agent system
  const cancelOrder = useCallback(async (asset: string, orderId: string): Promise<boolean> => {
    if (!isWalletConnected || !signTypedDataAsync || !address) {
      return false
    }

    try {
      // Pass address to cancelOrder for agent system
      return await hyperliquidOrders.cancelOrder(asset, orderId, signTypedDataAsync, address)
    } catch (error) {
      console.error('Order cancellation failed:', error)
      return false
    }
  }, [isWalletConnected, signTypedDataAsync, address])

  // Position result callback
  const onPositionResult = useCallback((
    cloid: string,
    callback: (result: 'win' | 'loss', exitPrice: number) => void
  ) => {
    hyperliquidOrders.onPositionResult(cloid, callback)
  }, [])

  // Get active positions
  const getActivePositions = useCallback((): PositionInfo[] => {
    return hyperliquidOrders.getActivePositions()
  }, [])

  // Get position by cloid
  const getPosition = useCallback((cloid: string): PositionInfo | undefined => {
    return hyperliquidOrders.getPosition(cloid)
  }, [])

  // Clear completed positions
  const clearCompletedPositions = useCallback(() => {
    hyperliquidOrders.clearCompletedPositions()
  }, [])

  // Set network
  const setNetwork = useCallback((useTestnet: boolean) => {
    hyperliquidOrders.setNetwork(useTestnet)
  }, [])

  // Fetch asset metadata
  useEffect(() => {
    let isMounted = true

    const fetchAssets = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Fetch perpetual metadata
        const perpMetadata = await hyperliquid.fetchPerpetualMeta()

        console.log("perpMetadata", perpMetadata)

        if (isMounted) {
          assetsMetadataRef.current = perpMetadata.universe
          console.log('Fetched assets metadata:', perpMetadata.universe.length, 'assets')
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch assets')
          console.error('Error fetching assets:', err)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchAssets()

    return () => {
      isMounted = false
    }
  }, [])

  // Set up WebSocket connection for real-time prices
  useEffect(() => {
    if (assetsMetadataRef.current.length === 0) return

    let isSubscribed = true

    const handlePriceUpdate = (prices: PriceFeed) => {
      if (!isSubscribed) return

      try {
        const transformedAssets = transformAssets(assetsMetadataRef.current, prices)
        setAssets(transformedAssets)
        setIsConnected(true)
        setLastUpdate(new Date())
        setError(null)

        console.log('Price update received:', Object.keys(prices).length, 'prices')
      } catch (err) {
        console.error('Error processing price update:', err)
        setError('Error processing price data')
      }
    }

    // Subscribe to price updates
    hyperliquid.subscribeToAllMids(handlePriceUpdate)

    // Set connection status
    setIsConnected(true)

    return () => {
      isSubscribed = false
      hyperliquid.disconnect()
      setIsConnected(false)
    }
  }, [assetsMetadataRef.current.length])

  // Connection status monitoring
  useEffect(() => {
    const checkConnection = setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate.getTime() > 10000) {
        // No update for 10 seconds, consider disconnected
        setIsConnected(false)
      }
    }, 5000)

    return () => clearInterval(checkConnection)
  }, [lastUpdate])

  return {
    // Price feed data
    assets,
    isLoading,
    error,
    isConnected,
    lastUpdate,

    // Wallet & Orders
    address,
    isWalletConnected,
    placePredictionOrder,
    cancelOrder,
    onPositionResult,
    getActivePositions,
    getPosition,
    clearCompletedPositions,
    setNetwork,

    // Utility
    getCurrentPrice,

    // P&L functionality
    getRealTimePnL: useCallback(async (userAddress: string) => {
      return await hyperliquidOrders.getRealTimePnL(userAddress)
    }, []),

    getAssetPnL: useCallback(async (userAddress: string, asset: string) => {
      return await hyperliquidOrders.getAssetPnL(userAddress, asset)
    }, []),

    startPnLPolling: useCallback((
      userAddress: string,
      callback: (pnlData: RealTimePnLData | null) => void,
      intervalMs: number = 2000
    ) => {
      return hyperliquidOrders.startPnLPolling(userAddress, callback, intervalMs)
    }, []),

    // Position size calculation
    calculatePositionSize
  }
}