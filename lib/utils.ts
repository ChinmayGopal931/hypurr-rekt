import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// src/hooks/hyperliquid/shared.ts
import type { SignTypedDataMutateAsync } from '@wagmi/core/query';
import { OrderBook, OrderBookLevel, HyperliquidAsset as SDKHyperliquidAsset, PriceFeed, hyperliquid } from '@/service/hyperliquid'; // Assuming these are SDK types
import { AssetConfig, hyperliquidOrders, HyperliquidOrderService, OrderRequest, PositionPnL, RealTimePnLData } from "@/service/hyperliquidOrders";
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { ethers } from "ethers";
import { Asset } from "./types";

// Re-export or define shared types to avoid import issues from the original monolithic file
export type HyperliquidAsset = SDKHyperliquidAsset;
export type { PriceFeed, OrderBook, OrderBookLevel };


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
        maxLeverage: asset.maxLeverage ?? 0,
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

export function getTopLeverageAssets(
  metadataUniverse: HyperliquidAsset[] | undefined | null,
  count: number = 10
): HyperliquidAsset[] {
  // Return an empty array if the input is null, undefined, or empty
  if (!metadataUniverse || metadataUniverse.length === 0) {
    return [];
  }

  // Create a copy before sorting to avoid mutating the original array
  const sortedAssets = [...metadataUniverse].sort((a, b) => {
    // Handle cases where maxLeverage might be undefined or null,
    // though based on your schema, it should be a number.
    // Default to 0 if undefined/null to ensure proper sorting.
    const leverageA = a.maxLeverage ?? 0;
    const leverageB = b.maxLeverage ?? 0;

    // Sort in descending order (higher leverage first)
    return leverageB - leverageA;
  });

  // Return the top 'count' assets
  return sortedAssets.slice(0, count);
}

// 1. Asset Metadata Hook - No caching (as requested)
export function useAssetMetadata(): UseQueryResult<HyperliquidAsset[], Error> {
  return useQuery({
    queryKey: hyperliquidKeys.assetMetadata(),
    queryFn: async (): Promise<HyperliquidAsset[]> => {
      const metadata = await hyperliquid.fetchPerpetualMeta();

      // Sort by maxLeverage in descending order and take top 10
      return metadata.universe
        .sort((a, b) => {
          const leverageA = a.maxLeverage ?? 0;
          const leverageB = b.maxLeverage ?? 0;
          return leverageB - leverageA;
        })
        .slice(0, 10);
    },
    // MODIFIED CACHE TIMES:
    staleTime: 1000 * 60 * 60,    // Consider data fresh for 60 minutes
    gcTime: 1000 * 60 * 60,     // Keep unused data for 60 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
}

export function formatPrice(price: number, assetDecimals: number): string {
  try {
    // Validate input price
    if (isNaN(price) || !isFinite(price)) {
      throw new Error(`Invalid price: ${price}`);
    }

    // Helper: Truncate decimals without rounding
    function truncateDecimals(num: number, decimals: number): number {
      const factor = Math.pow(10, decimals);
      return Math.floor(num * factor) / factor;
    }

    // Helper: Count significant digits in a number
    function countSignificantDigits(num: number): number {
      if (num === 0) return 0;
      const str = num.toExponential(); // e.g. "1.23456e+3"
      const digits = str.replace(/\.|e.*$/g, ''); // remove dot and exponent
      const sigDigits = digits.replace(/^0+/, ''); // remove leading zeros
      return sigDigits.length;
    }

    // Helper: Truncate number to max significant figures without rounding
    function truncateToSignificantFigures(num: number, maxSigFigs: number): number {
      if (num === 0) return 0;
      const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
      const decimals = maxSigFigs - digits;
      if (decimals < 0) {
        // Truncate integer part
        const factor = Math.pow(10, digits - maxSigFigs);
        return Math.floor(num / factor) * factor;
      } else {
        // Truncate decimals
        return truncateDecimals(num, decimals);
      }
    }

    // Calculate max decimals allowed based on assetDecimals
    const maxDecimals = Math.min(6, Math.max(1, 6 - assetDecimals));
    const maxSignificantFigures = 5;

    // Step 1: Truncate decimals to maxDecimals
    let truncatedPrice = truncateDecimals(price, maxDecimals);

    // Step 2: Truncate to max significant figures if exceeded
    const sigDigits = countSignificantDigits(truncatedPrice);
    if (sigDigits > maxSignificantFigures) {
      truncatedPrice = truncateToSignificantFigures(truncatedPrice, maxSignificantFigures);
    }

    // Step 3: Format number to fixed decimals and remove trailing zeros
    const formatted = truncatedPrice.toFixed(maxDecimals).replace(/\.?0+$/, '');

    console.log(`Formatted price: ${price} -> ${formatted} (maxDecimals: ${maxDecimals})`);

    return formatted;
  } catch (error) {
    console.error('Error formatting price:', error);
    // Fallback: return original price as string
    return price.toString();
  }
}


/**
 * Generate a unique client order ID
 */
export function generateCloid(): string {
  return '0x' + Buffer.from(ethers.randomBytes(16)).toString('hex')
}


/**
 * Fetch real-time P&L data from Hyperliquid
 */
export async function getRealTimePnL(userAddress: string): Promise<RealTimePnLData | null> {
  try {
    const response = await fetch(`${hyperliquidOrders.getApiUrl()}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress.toLowerCase()
      })
    })

    if (!response.ok) {
      console.warn('Failed to fetch P&L data:', response.status)
      return null
    }

    const result = await response.json()

    if (!result || !result.assetPositions) {
      return {
        totalUnrealizedPnl: 0,
        positions: [],
        lastUpdate: Date.now()
      }
    }

    // Extract position data
    const positions: PositionPnL[] = result.assetPositions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((pos: any) => parseFloat(pos.position.szi) !== 0) // Only open positions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((pos: any) => ({
        asset: pos.position.coin,
        size: pos.position.szi,
        entryPx: pos.position.entryPx || '0',
        unrealizedPnl: pos.position.unrealizedPnl || '0',
        returnOnEquity: pos.position.returnOnEquity || '0',
        positionValue: pos.position.positionValue || '0',
        leverage: pos.position.leverage || '1'
      }))

    // Calculate total unrealized P&L
    const totalUnrealizedPnl = positions.reduce((total, pos) => {
      return total + parseFloat(pos.unrealizedPnl)
    }, 0)

    return {
      totalUnrealizedPnl,
      positions,
      lastUpdate: Date.now()
    }

  } catch (error) {
    console.error('Error fetching real-time P&L:', error)
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkUserAccount(userAddress: string): Promise<{ exists: boolean, balance?: any }> {
  try {
    const response = await fetch(`${hyperliquidOrders.getApiUrl()}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress.toLowerCase()
      })
    })

    if (!response.ok) {
      console.log('❌ Account check failed:', response.status)
      return { exists: false }
    }

    const result = await response.json()
    console.log('🔍 Account check result:', result)

    if (result && (result.marginSummary || result.crossMarginSummary)) {
      console.log('✅ Account exists with balance')
      return { exists: true, balance: result }
    } else {
      console.log('❌ Account does not exist or has no balance')
      return { exists: false }
    }
  } catch (error) {
    console.error('❌ Error checking account:', error)
    return { exists: false }
  }
}

/**
 * Get asset configuration from metadata via direct API call
 */
export async function getAssetConfig(assetSymbol: string): Promise<AssetConfig> {
  try {
    const response = await fetch(`${hyperliquidOrders.getApiUrl()}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'meta' })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch perpetual metadata: ${response.status}`)
    }

    const metadata = await response.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asset = metadata.universe.find((a: any) => a.name === assetSymbol)

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


export function calculateTrueLeveragePosition(leverage: number = 20): number {
  const positionValue = HyperliquidOrderService.MARGIN_AMOUNT * leverage
  console.log(`💰 True leverage: $${HyperliquidOrderService.MARGIN_AMOUNT} margin × ${leverage}x = $${positionValue} position`)
  return positionValue
}


export function calculateOrderSizeWithTrueLeverage(price: number, assetDecimals: number, leverage: number = 20): string {
  const positionValue = calculateTrueLeveragePosition(leverage);
  const assetSize = positionValue / price;

  // Format properly for Hyperliquid
  const factor = Math.pow(10, assetDecimals);
  const rounded = Math.floor(assetSize * factor) / factor;

  return rounded.toString().replace(/\.?0+$/, '');
}