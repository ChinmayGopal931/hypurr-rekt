// src/hooks/useHyperliquid.ts
import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query'
import { useAccount, useSignTypedData } from 'wagmi'
import { useSwitchChain } from 'wagmi'
import { useCallback, useEffect, useRef } from 'react'
import type { SignTypedDataMutateAsync } from '@wagmi/core/query'
import { hyperliquid, HyperliquidAsset, PriceFeed } from '@/service/hyperliquid'
import { hyperliquidOrders, OrderRequest, OrderResponse, PositionInfo, RealTimePnLData } from '@/service/hyperliquidOrders'

export interface Asset {
  id: string
  name: string
  symbol: string
  price: number
  change24h: number
  timestamp: number
}

export interface PriceHistory {
  [symbol: string]: Array<{ price: number; timestamp: number }>
}

export interface HyperliquidError {
  message: string
  code?: string | number
  details?: unknown
}

export interface PlaceOrderParams {
  request: OrderRequest
  signTypedDataAsync: SignTypedDataMutateAsync
  userAddress: string
}

export interface CancelOrderParams {
  asset: string
  orderId: string
  signTypedDataAsync: SignTypedDataMutateAsync
  userAddress: string
}

export interface PositionSizeResult {
  usdValue: number
  assetSize: string
  currentPrice: number
}

export interface AssetPnLResult {
  unrealizedPnl: number
  returnOnEquity: number
  positionValue: number
}

export interface UseHyperliquidQueries {
  assetMetadata: UseQueryResult<HyperliquidAsset[], Error>
  priceData: UseQueryResult<Asset[], Error>
  priceHistory: UseQueryResult<PriceHistory, Error>
  positions: UseQueryResult<PositionInfo[], Error>
  pnl: UseQueryResult<RealTimePnLData | null, Error>
}

export interface UseHyperliquidMutations {
  placePredictionOrder: UseMutationResult<OrderResponse, Error, PlaceOrderParams, unknown>
  cancelOrder: UseMutationResult<boolean, Error, CancelOrderParams, unknown>
}

export interface UseHyperliquidReturn {
  // Core data
  assets: Asset[]
  isLoading: boolean
  error: string | null
  isConnected: boolean
  lastUpdate: Date | null

  // Wallet integration
  address: string | undefined
  isWalletConnected: boolean

  // Order management
  placePredictionOrder: (request: OrderRequest) => Promise<OrderResponse>
  cancelOrder: (asset: string, orderId: string) => Promise<boolean>

  // Position management
  onPositionResult: (cloid: string, callback: (result: 'win' | 'loss', exitPrice: number) => void) => void
  getActivePositions: () => PositionInfo[]
  getPosition: (cloid: string) => PositionInfo | undefined
  clearCompletedPositions: () => void

  // Network management
  setNetwork: (useTestnet: boolean) => void

  // Price utilities
  getCurrentPrice: (symbol: string) => number | null
  getPriceHistory: (symbol: string) => Array<{ price: number; timestamp: number }>

  // P&L functions
  getRealTimePnL: (userAddress: string) => Promise<RealTimePnLData | null>
  getAssetPnL: (userAddress: string, asset: string) => Promise<AssetPnLResult | null>
  startPnLPolling: (
    userAddress: string,
    callback: (pnlData: RealTimePnLData | null) => void,
    intervalMs?: number
  ) => () => void

  // Position calculations
  calculatePositionSize: (asset: string, leverage: number) => Promise<PositionSizeResult | null>

  // Query states for granular control
  queries: UseHyperliquidQueries
  mutations: UseHyperliquidMutations
}

// Query Keys - centralized for consistency
export const hyperliquidKeys = {
  all: ['hyperliquid'] as const,
  assetMetadata: () => [...hyperliquidKeys.all, 'metadata'] as const,
  priceData: () => [...hyperliquidKeys.all, 'priceData'] as const,
  priceHistory: () => [...hyperliquidKeys.all, 'priceHistory'] as const,
  positions: (address?: string) => [...hyperliquidKeys.all, 'positions', address] as const,
  pnl: (address?: string) => [...hyperliquidKeys.all, 'pnl', address] as const,
  assetPnl: (address?: string, asset?: string) => [...hyperliquidKeys.all, 'assetPnl', address, asset] as const,
} as const

// 1. Asset Metadata Hook - No caching (as requested)
export function useAssetMetadata(): UseQueryResult<HyperliquidAsset[], Error> {
  return useQuery({
    queryKey: hyperliquidKeys.assetMetadata(),
    queryFn: async (): Promise<HyperliquidAsset[]> => {
      const metadata = await hyperliquid.fetchPerpetualMeta()
      return metadata.universe
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: 3,
  })
}

// 2. Real-time Price Data Hook - WebSocket + React Query integration
export function usePriceData(assets: HyperliquidAsset[]): UseQueryResult<Asset[], Error> {
  const queryClient = useQueryClient()
  const previousPricesRef = useRef<Record<string, number>>({})
  const wsConnectedRef = useRef(false)

  const query = useQuery({
    queryKey: hyperliquidKeys.priceData(),
    queryFn: (): Asset[] => {
      // Return current cached data or empty array
      return queryClient.getQueryData<Asset[]>(hyperliquidKeys.priceData()) || []
    },
    enabled: assets.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes - for price history analysis
    gcTime: 1000 * 60 * 30, // 30 minutes - keep for history
    refetchInterval: false, // No polling, WebSocket only
    refetchOnWindowFocus: false,
  })

  // WebSocket integration for fastest real-time updates
  useEffect(() => {
    if (assets.length === 0 || wsConnectedRef.current) return

    let isSubscribed = true
    wsConnectedRef.current = true

    const handlePriceUpdate = (prices: PriceFeed): void => {
      if (!isSubscribed) return

      const timestamp = Date.now()
      const transformedAssets = transformAssets(assets, prices, previousPricesRef.current, timestamp)

      // Update React Query cache immediately - fastest updates
      queryClient.setQueryData(hyperliquidKeys.priceData(), transformedAssets)

      // Update price history for analysis
      const currentHistory = queryClient.getQueryData<PriceHistory>(hyperliquidKeys.priceHistory()) || {}
      const updatedHistory = { ...currentHistory }

      transformedAssets.forEach(asset => {
        if (!updatedHistory[asset.id]) {
          updatedHistory[asset.id] = []
        }
        updatedHistory[asset.id].push({ price: asset.price, timestamp })

        // Keep last 1000 price points for analysis (adjust as needed)
        if (updatedHistory[asset.id].length > 1000) {
          updatedHistory[asset.id] = updatedHistory[asset.id].slice(-1000)
        }
      })

      queryClient.setQueryData(hyperliquidKeys.priceHistory(), updatedHistory)

      // Update previous prices for change calculation
      Object.entries(prices).forEach(([symbol, price]) => {
        previousPricesRef.current[symbol] = parseFloat(price)
      })
    }

    console.log('🔌 Connecting to Hyperliquid WebSocket for real-time prices')
    hyperliquid.subscribeToAllMids(handlePriceUpdate)

    return (): void => {
      isSubscribed = false
      wsConnectedRef.current = false
      hyperliquid.disconnect()
      console.log('🔌 Disconnected from Hyperliquid WebSocket')
    }
  }, [assets.length, queryClient])

  return query
}

// 3. Price History Hook - For analysis
export function usePriceHistory(): UseQueryResult<PriceHistory, Error> {
  return useQuery({
    queryKey: hyperliquidKeys.priceHistory(),
    queryFn: (): PriceHistory => {
      // Return current cached history
      return {} as PriceHistory
    },
    staleTime: Infinity, // Never stale - continuously updated via WebSocket
    gcTime: 1000 * 60 * 60, // 1 hour cache
  })
}

// 4. Positions Hook - React Query managed with background refetching
export function usePositions(address?: string): UseQueryResult<PositionInfo[], Error> {
  return useQuery({
    queryKey: hyperliquidKeys.positions(address),
    queryFn: (): PositionInfo[] => hyperliquidOrders.getActivePositions(),
    enabled: !!address,
    refetchInterval: 2000, // Background refetch every 2 seconds
    staleTime: 1000, // Consider stale after 1 second for active trading
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

// 5. Real-time PnL Hook - Background managed
export function useRealTimePnL(address?: string): UseQueryResult<RealTimePnLData | null, Error> {
  return useQuery({
    queryKey: hyperliquidKeys.pnl(address),
    queryFn: async (): Promise<RealTimePnLData | null> => {
      if (!address) return null
      return await hyperliquidOrders.getRealTimePnL(address)
    },
    enabled: !!address,
    refetchInterval: 2000, // Every 2 seconds
    staleTime: 1000,
    refetchOnWindowFocus: true,
  })
}

// 6. Asset-specific PnL Hook
export function useAssetPnL(address?: string, asset?: string): UseQueryResult<AssetPnLResult | null, Error> {
  return useQuery({
    queryKey: hyperliquidKeys.assetPnl(address, asset),
    queryFn: async (): Promise<AssetPnLResult | null> => {
      if (!address || !asset) return null
      return await hyperliquidOrders.getAssetPnL(address, asset)
    },
    enabled: !!address && !!asset,
    refetchInterval: 2000,
    staleTime: 1000,
  })
}

// 7. Order Mutations - No optimistic updates (wait for server)
export function useOrderMutations(): UseHyperliquidMutations {
  const queryClient = useQueryClient()
  const { address } = useAccount()

  const placePredictionOrderMutation = useMutation<OrderResponse, Error, PlaceOrderParams>({
    mutationFn: async ({ request, signTypedDataAsync, userAddress }: PlaceOrderParams): Promise<OrderResponse> => {
      const result = await hyperliquidOrders.placePredictionOrder(request, signTypedDataAsync, userAddress)
      // No optimistic updates - wait for server response
      return result
    },
    onSuccess: (result: OrderResponse): void => {
      if (result.success) {
        // Only invalidate after successful server confirmation
        queryClient.invalidateQueries({ queryKey: hyperliquidKeys.positions(address) })
        console.log('✅ Order placed successfully, refreshing positions')
      }
    },
    onError: (error: Error): void => {
      console.error('❌ Order placement failed:', error.message)
    }
  })

  const cancelOrderMutation = useMutation<boolean, Error, CancelOrderParams>({
    mutationFn: async ({ asset, orderId, signTypedDataAsync, userAddress }: CancelOrderParams): Promise<boolean> => {
      return await hyperliquidOrders.cancelOrder(asset, orderId, signTypedDataAsync, userAddress)
    },
    onSuccess: (success: boolean): void => {
      if (success) {
        // Only invalidate after successful cancellation
        queryClient.invalidateQueries({ queryKey: hyperliquidKeys.positions(address) })
        console.log('✅ Order cancelled successfully, refreshing positions')
      }
    },
    onError: (error: Error): void => {
      console.error('❌ Order cancellation failed:', error.message)
    }
  })

  return {
    placePredictionOrder: placePredictionOrderMutation,
    cancelOrder: cancelOrderMutation,
  }
}

// Helper function to transform raw price data to Asset format
export const transformAssets = (
  metadata: HyperliquidAsset[],
  prices: PriceFeed,
  previousPrices: Record<string, number>,
  timestamp: number
): Asset[] => {
  const popularAssets = ['BTC', 'ETH', 'SOL', 'ARB', 'DOGE'] as const

  return metadata
    .filter(asset => prices[asset.name])
    .sort((a, b) => {
      const aIndex = popularAssets.indexOf(a.name as typeof popularAssets[number])
      const bIndex = popularAssets.indexOf(b.name as typeof popularAssets[number])
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a.name.localeCompare(b.name)
    })
    .map((asset): Asset => {
      const currentPrice = parseFloat(prices[asset.name])
      const previousPrice = previousPrices[asset.name]
      const change24h = previousPrice
        ? ((currentPrice - previousPrice) / previousPrice) * 100
        : (Math.random() - 0.5) * 10

      return {
        id: asset.name,
        name: getAssetDisplayName(asset.name),
        symbol: `${asset.name}-PERP`,
        price: currentPrice,
        change24h,
        timestamp
      }
    })
    .slice(0, 8)
}

const getAssetDisplayName = (symbol: string): string => {
  const names: Record<string, string> = {
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

// Custom error handler with proper typing
const handleApiError = (error: unknown): HyperliquidError => {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error
    }
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return {
      message: String(error.message),
      details: error
    }
  }

  return {
    message: 'An unknown error occurred',
    details: error
  }
}

// 8. Main Hook - Combines everything efficiently
export function useHyperliquid(): UseHyperliquidReturn {
  const { address, isConnected: isWalletConnected, chain } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChain: switchNetwork } = useSwitchChain()
  const queryClient = useQueryClient()

  // Efficient data fetching - only what's needed
  const assetMetadataQuery = useAssetMetadata()
  const priceDataQuery = usePriceData(assetMetadataQuery.data || [])
  const positionsQuery = usePositions(address)
  const pnlQuery = useRealTimePnL(address)
  const priceHistoryQuery = usePriceHistory()

  // Mutations
  const { placePredictionOrder: placeMutation, cancelOrder: cancelMutation } = useOrderMutations()

  // Derived state - minimal re-renders
  const assets = priceDataQuery.data || []
  const isLoading = assetMetadataQuery.isLoading && priceDataQuery.isLoading
  const error = assetMetadataQuery.error || priceDataQuery.error
  const isConnected = !priceDataQuery.isError && assets.length > 0

  // Optimized helper functions
  const getCurrentPrice = useCallback((symbol: string): number | null => {
    const asset = assets.find(a => a.id === symbol)
    return asset?.price || null
  }, [assets])

  const getPriceHistory = useCallback((symbol: string): Array<{ price: number; timestamp: number }> => {
    return priceHistoryQuery.data?.[symbol] || []
  }, [priceHistoryQuery.data])

  const calculatePositionSize = useCallback(async (asset: string, leverage: number): Promise<PositionSizeResult | null> => {
    try {
      const currentPrice = getCurrentPrice(asset)
      if (!currentPrice) return null

      const assetMetadata = assetMetadataQuery.data?.find(a => a.name === asset)
      if (!assetMetadata) return null

      const marginAmount = 10
      const usdValue = marginAmount * leverage
      const rawAssetSize = usdValue / currentPrice
      const assetDecimals = assetMetadata.szDecimals || 5
      const factor = Math.pow(10, assetDecimals)
      const roundedAssetSize = Math.floor(rawAssetSize * factor) / factor

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

      return { usdValue, assetSize, currentPrice }
    } catch (error: unknown) {
      const handledError = handleApiError(error)
      console.error('Error calculating position size:', handledError.message)
      return null
    }
  }, [getCurrentPrice, assetMetadataQuery.data])

  // Order placement - no optimistic updates
  const placePredictionOrder = useCallback(async (request: OrderRequest): Promise<OrderResponse> => {
    if (!isWalletConnected || !address || !signTypedDataAsync) {
      return { success: false, error: 'Wallet not connected' }
    }

    // Leverage validation
    const maxLeverage = request.asset === 'BTC' ? 40 : request.asset === 'ETH' ? 25 : 50
    if (request.leverage && request.leverage > maxLeverage) {
      return { success: false, error: `Maximum leverage for ${request.asset} is ${maxLeverage}x` }
    }

    // Network validation
    const expectedChainId = 421614
    if (chain?.id !== expectedChainId) {
      if (switchNetwork) {
        try {
          await switchNetwork({ chainId: expectedChainId })
        } catch (error: unknown) {
          const handledError = handleApiError(error)
          return { success: false, error: `Please switch to Arbitrum Sepolia testnet: ${handledError.message}` }
        }
      } else {
        return { success: false, error: `Please switch to Arbitrum Sepolia testnet` }
      }
    }

    // Use current market price if not specified
    if (!request.price || request.price === 0) {
      const currentPrice = getCurrentPrice(request.asset)
      if (!currentPrice) {
        return { success: false, error: `No current price available for ${request.asset}` }
      }
      request.price = currentPrice
    }

    try {
      // Wait for server confirmation - no optimistic updates
      const result = await placeMutation.mutateAsync({
        request,
        signTypedDataAsync,
        userAddress: address
      })
      return result
    } catch (error: unknown) {
      const handledError = handleApiError(error)
      return { success: false, error: handledError.message }
    }
  }, [isWalletConnected, address, signTypedDataAsync, getCurrentPrice, chain?.id, switchNetwork, placeMutation])

  const cancelOrder = useCallback(async (asset: string, orderId: string): Promise<boolean> => {
    if (!isWalletConnected || !signTypedDataAsync || !address) {
      return false
    }

    try {
      return await cancelMutation.mutateAsync({
        asset,
        orderId,
        signTypedDataAsync,
        userAddress: address
      })
    } catch (error: unknown) {
      const handledError = handleApiError(error)
      console.error('Order cancellation failed:', handledError.message)
      return false
    }
  }, [isWalletConnected, signTypedDataAsync, address, cancelMutation])

  // React Query managed position functions
  const getActivePositions = useCallback((): PositionInfo[] => {
    return positionsQuery.data || []
  }, [positionsQuery.data])

  const getPosition = useCallback((cloid: string): PositionInfo | undefined => {
    return positionsQuery.data?.find(p => p.cloid === cloid)
  }, [positionsQuery.data])

  const clearCompletedPositions = useCallback((): void => {
    hyperliquidOrders.clearCompletedPositions()
    // Invalidate to trigger fresh fetch
    queryClient.invalidateQueries({ queryKey: hyperliquidKeys.positions(address) })
  }, [queryClient, address])

  const setNetwork = useCallback((useTestnet: boolean): void => {
    hyperliquidOrders.setNetwork(useTestnet)
    // Invalidate all queries when network changes
    queryClient.invalidateQueries({ queryKey: hyperliquidKeys.all })
  }, [queryClient])

  // Position result callback
  const onPositionResult = useCallback((cloid: string, callback: (result: 'win' | 'loss', exitPrice: number) => void): void => {
    hyperliquidOrders.onPositionResult(cloid, callback)
  }, [])

  // P&L functions - integrated with React Query
  const getRealTimePnL = useCallback(async (userAddress: string): Promise<RealTimePnLData | null> => {
    return pnlQuery.data || await hyperliquidOrders.getRealTimePnL(userAddress)
  }, [pnlQuery.data])

  const getAssetPnL = useCallback(async (userAddress: string, asset: string): Promise<AssetPnLResult | null> => {
    return await hyperliquidOrders.getAssetPnL(userAddress, asset)
  }, [])

  const startPnLPolling = useCallback((
    userAddress: string,
    callback: (pnlData: RealTimePnLData | null) => void,
  ): (() => void) => {
    // React Query handles polling automatically
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey.includes('pnl') && event.query.queryKey.includes(userAddress)) {
        if (event.type === 'updated') {
          callback(event.query.state.data as RealTimePnLData | null)
        }
      }
    })
    return unsubscribe
  }, [queryClient])

  return {
    // Core data - fastest updates via WebSocket + React Query
    assets,
    isLoading,
    error: error?.message || null,
    isConnected,
    lastUpdate: priceDataQuery.dataUpdatedAt ? new Date(priceDataQuery.dataUpdatedAt) : null,

    // Wallet integration
    address,
    isWalletConnected,

    // Order management - server confirmation required
    placePredictionOrder,
    cancelOrder,

    // Position management - React Query background updates
    onPositionResult,
    getActivePositions,
    getPosition,
    clearCompletedPositions,

    // Network management
    setNetwork,

    // Price utilities
    getCurrentPrice,
    getPriceHistory, // New: for price analysis

    // P&L functions
    getRealTimePnL,
    getAssetPnL,
    startPnLPolling,

    // Position calculations
    calculatePositionSize,

    // Query states for granular control
    queries: {
      assetMetadata: assetMetadataQuery,
      priceData: priceDataQuery,
      priceHistory: priceHistoryQuery,
      positions: positionsQuery,
      pnl: pnlQuery,
    },

    // Mutation states
    mutations: {
      placePredictionOrder: placeMutation,
      cancelOrder: cancelMutation,
    }
  }
}