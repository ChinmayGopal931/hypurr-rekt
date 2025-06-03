// src/hooks/useHyperliquid.ts
import { useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query'
import { useCallback } from 'react'
import { hyperliquid, HyperliquidAsset, OrderBook } from '@/service/hyperliquid'
import { hyperliquidOrders, PositionInfo, RealTimePnLData } from '@/service/hyperliquidOrders'
import { Asset, handleApiError, PriceHistory, processOrderBook, useAssetMetadata } from '@/lib/utils'
import { useOrderBook, usePriceData } from './useHyperliquidSubscription'


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

// Order Book Types
export interface ProcessedOrderBook {
  bids: ProcessedOrderLevel[]
  asks: ProcessedOrderLevel[]
  coin: string
  time: number
  maxTotal: number // For size bar calculations
}

export interface ProcessedOrderLevel {
  price: number
  size: number
  total: number
  sizePercent: number // For size bars (0-100)
  totalPercent: number // For total bars (0-100)
}

export interface UseHyperliquidQueries {
  assetMetadata: UseQueryResult<HyperliquidAsset[], Error>
  priceData: UseQueryResult<Asset[], Error>
  priceHistory: UseQueryResult<PriceHistory, Error>
  positions: UseQueryResult<PositionInfo[], Error>
  pnl: UseQueryResult<RealTimePnLData | null, Error>
  orderBook: (coin?: string) => UseQueryResult<OrderBook | null, Error>
}


export interface UseHyperliquidReturn {
  // Core data
  assets: Asset[]
  isLoading: boolean
  error: string | null
  isConnected: boolean
  lastUpdate: Date | null

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

  // Order book functions
  getOrderBook: (coin: string) => ProcessedOrderBook | null
  subscribeToOrderBook: (coin: string) => void
  unsubscribeFromOrderBook: (coin: string) => void

  // Query states for granular control
  queries: UseHyperliquidQueries
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
  orderBook: (coin?: string) => [...hyperliquidKeys.all, 'orderBook', coin] as const,
} as const


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


// 9. Main Hook - Combines everything efficiently
export function useHyperliquid(address: `0x${string}` | undefined): UseHyperliquidReturn {
  const queryClient = useQueryClient()

  // Efficient data fetching - only what's needed
  const assetMetadataQuery = useAssetMetadata()
  const priceDataQuery = usePriceData(assetMetadataQuery.data || [])
  const positionsQuery = usePositions(address)
  const pnlQuery = useRealTimePnL(address)
  const priceHistoryQuery = usePriceHistory()


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

  // Order book functions
  const getOrderBook = useCallback((coin: string): ProcessedOrderBook | null => {
    const orderBookData = queryClient.getQueryData<OrderBook>(hyperliquidKeys.orderBook(coin))
    return processOrderBook(orderBookData || null)
  }, [queryClient])

  const subscribeToOrderBook = useCallback((coin: string): void => {
    hyperliquid.subscribeToL2Book(coin, (orderBook: OrderBook) => {
      queryClient.setQueryData(hyperliquidKeys.orderBook(coin), orderBook)
    })
  }, [queryClient])

  const unsubscribeFromOrderBook = useCallback((coin: string): void => {
    hyperliquid.unsubscribeFromL2Book(coin)
    // Optionally clear the cached data
    queryClient.removeQueries({ queryKey: hyperliquidKeys.orderBook(coin) })
  }, [queryClient])

  return {
    // Core data - fastest updates via WebSocket + React Query
    assets,
    isLoading,
    error: error?.message || null,
    isConnected,
    lastUpdate: priceDataQuery.dataUpdatedAt ? new Date(priceDataQuery.dataUpdatedAt) : null,

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

    // Order book functions
    getOrderBook,
    subscribeToOrderBook,
    unsubscribeFromOrderBook,

    // Query states for granular control
    queries: {
      assetMetadata: assetMetadataQuery,
      priceData: priceDataQuery,
      priceHistory: priceHistoryQuery,
      positions: positionsQuery,
      pnl: pnlQuery,
      orderBook: useOrderBook, // Return the hook function
    },


  }
}