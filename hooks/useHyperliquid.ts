// src/hooks/useHyperliquid.ts
import { useState, useEffect, useRef } from 'react'
import { hyperliquid, HyperliquidAsset, PriceFeed } from '@/service/hyperliquid'
import { Asset } from '@/lib/types'

export interface UseHyperliquidReturn {
  assets: Asset[]
  isLoading: boolean
  error: string | null
  isConnected: boolean
  lastUpdate: Date | null
}

export function useHyperliquid(): UseHyperliquidReturn {
  const [assets, setAssets] = useState<Asset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  
  const assetsMetadataRef = useRef<HyperliquidAsset[]>([])
  const previousPricesRef = useRef<{ [symbol: string]: number }>({})

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

  // Transform Hyperliquid data to our Asset format
  const transformAssets = (metadata: HyperliquidAsset[], prices: PriceFeed): Asset[] => {
    return metadata
      .filter(asset => prices[asset.name]) // Only include assets with price data
      .map((asset, index) => {
        const currentPrice = parseFloat(prices[asset.name])
        const change24h = calculate24hChange(asset.name, currentPrice)
        
        // Store current price for next calculation
        previousPricesRef.current[asset.name] = currentPrice

        return {
          id: asset.name,
          name: getAssetDisplayName(asset.name),
          symbol: `${asset.name}-PERP`,
          price: currentPrice,
          change24h: change24h
        }
      })
      .slice(0, 5) // Limit to top 3 assets for better UX
  }

  // Get display name for asset
  const getAssetDisplayName = (symbol: string): string => {
    const names: { [key: string]: string } = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum', 
      'SOL': 'Solana',
    }
    return names[symbol] || symbol
  }

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
    assets,
    isLoading,
    error,
    isConnected,
    lastUpdate
  }
}