import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// src/hooks/hyperliquid/shared.ts
import type { SignTypedDataMutateAsync } from '@wagmi/core/query';
import { OrderBook, OrderBookLevel, HyperliquidAsset as SDKHyperliquidAsset, PriceFeed, hyperliquid } from '@/service/hyperliquid'; // Assuming these are SDK types
import { OrderRequest } from "@/service/hyperliquidOrders";
import { useQuery, UseQueryResult } from "@tanstack/react-query";

// Re-export or define shared types to avoid import issues from the original monolithic file
export type HyperliquidAsset = SDKHyperliquidAsset;
export type { PriceFeed, OrderBook, OrderBookLevel };


// SHARED INTERFACES (originally in useHyperliquid.ts)
export interface Asset {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  timestamp: number;
}

export interface PriceHistory {
  [symbol: string]: Array<{ price: number; timestamp: number }>;
}

export interface HyperliquidError {
  message: string;
  code?: string | number;
  details?: unknown;
}

export interface PlaceOrderParams {
  request: OrderRequest;
  signTypedDataAsync: SignTypedDataMutateAsync; // From wagmi
  userAddress: string;
  currentMarketPrice?: number; // Optional: pass if already known
}

export interface CancelOrderParams {
  asset: string;
  orderId: string;
  signTypedDataAsync: SignTypedDataMutateAsync; // From wagmi
  userAddress: string;
}

// Assuming OrderRequest, OrderResponse, PositionInfo, RealTimePnLData are defined in '@/service/hyperliquidOrders'
export type { OrderRequest, OrderResponse, PositionInfo, RealTimePnLData } from '@/service/hyperliquidOrders';


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
} as const;

// Custom error handler with proper typing
export const handleApiError = (error: unknown): HyperliquidError => {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error,
    };
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return {
      message: String(error.message),
      details: error,
    };
  }
  return {
    message: 'An unknown error occurred',
    details: error,
  };
};

// Helper function to transform raw price data to Asset format
export const transformAssets = (
  metadata: HyperliquidAsset[],
  prices: PriceFeed,
  previousPrices: Record<string, number>,
  timestamp: number
): Asset[] => {
  const popularAssets = ['BTC', 'ETH', 'SOL', 'ARB', 'DOGE'] as const;

  return metadata
    .filter(asset => prices[asset.name])
    .sort((a, b) => {
      const aIndex = popularAssets.indexOf(a.name as typeof popularAssets[number]);
      const bIndex = popularAssets.indexOf(b.name as typeof popularAssets[number]);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((asset): Asset => {
      const currentPrice = parseFloat(prices[asset.name]);
      const previousPrice = previousPrices[asset.name];
      const change24h = previousPrice
        ? ((currentPrice - previousPrice) / previousPrice) * 100
        : (Math.random() - 0.5) * 10; // Fallback, consider fetching historical for true 24h

      return {
        id: asset.name,
        name: getAssetDisplayName(asset.name),
        symbol: `${asset.name}-PERP`,
        price: currentPrice,
        change24h,
        timestamp
      };
    })
    .slice(0, 8); // Limiting to 8 assets
};

export const getAssetDisplayName = (symbol: string): string => {
  const names: Record<string, string> = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'SOL': 'Solana',
    'ARB': 'Arbitrum',
    'DOGE': 'Dogecoin',
    'AVAX': 'Avalanche',
    'LINK': 'Chainlink',
    'UNI': 'Uniswap'
  };
  return names[symbol] || symbol;
};

// Order Book Types (can be shared or specific to data hook if only used there)
export interface ProcessedOrderBook {
  bids: ProcessedOrderLevel[];
  asks: ProcessedOrderLevel[];
  coin: string;
  time: number;
  maxTotal: number;
}

export interface ProcessedOrderLevel {
  price: number;
  size: number;
  total: number;
  sizePercent: number;
  totalPercent: number;
}

export function processOrderBook(orderBook: OrderBook | null): ProcessedOrderBook | null {
  if (!orderBook || !orderBook.levels) return null;

  const [rawBids, rawAsks] = orderBook.levels;

  const bids: ProcessedOrderLevel[] = rawBids
    .slice(0, 10)
    .map((bid: OrderBookLevel) => ({
      price: parseFloat(bid.px),
      size: parseFloat(bid.sz),
      total: 0,
      sizePercent: 0,
      totalPercent: 0
    }))
    .sort((a, b) => b.price - a.price);

  const asks: ProcessedOrderLevel[] = rawAsks
    .slice(0, 10)
    .map((ask: OrderBookLevel) => ({
      price: parseFloat(ask.px),
      size: parseFloat(ask.sz),
      total: 0,
      sizePercent: 0,
      totalPercent: 0
    }))
    .sort((a, b) => a.price - b.price);

  let bidTotal = 0;
  bids.forEach(bid => {
    bidTotal += bid.size;
    bid.total = bidTotal;
  });

  let askTotal = 0;
  asks.forEach(ask => {
    askTotal += ask.size;
    ask.total = askTotal;
  });

  const maxSize = Math.max(
    ...bids.map(b => b.size),
    ...asks.map(a => a.size),
    0 // ensure Math.max doesn't return -Infinity for empty arrays
  );
  const maxTotal = Math.max(bidTotal, askTotal, 0);

  bids.forEach(bid => {
    bid.sizePercent = maxSize > 0 ? (bid.size / maxSize) * 100 : 0;
    bid.totalPercent = maxTotal > 0 ? (bid.total / maxTotal) * 100 : 0;
  });

  asks.forEach(ask => {
    ask.sizePercent = maxSize > 0 ? (ask.size / maxSize) * 100 : 0;
    ask.totalPercent = maxTotal > 0 ? (ask.total / maxTotal) * 100 : 0;
  });

  return {
    bids,
    asks,
    coin: orderBook.coin,
    time: orderBook.time,
    maxTotal
  };
}

// 1. Asset Metadata Hook - No caching (as requested)
export function useAssetMetadata(): UseQueryResult<HyperliquidAsset[], Error> {
  return useQuery({
    queryKey: hyperliquidKeys.assetMetadata(),
    queryFn: async (): Promise<HyperliquidAsset[]> => {
      const metadata = await hyperliquid.fetchPerpetualMeta();
      return metadata.universe;
    },
    // MODIFIED CACHE TIMES:
    staleTime: 1000 * 60 * 5,    // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 10,     // Keep unused data for 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
}