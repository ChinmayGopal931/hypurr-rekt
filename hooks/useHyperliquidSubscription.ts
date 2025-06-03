// src/hooks/useHyperliquidSubscriptions.ts
import { useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { hyperliquid, HyperliquidAsset, PriceFeed, OrderBook } from '@/service/hyperliquid';
import { Asset, hyperliquidKeys, PriceHistory, transformAssets } from '@/lib/utils';

// Real-time Price Data Hook - WebSocket + React Query integration
export function usePriceData(assets: HyperliquidAsset[]): UseQueryResult<Asset[], Error> {
  const queryClient = useQueryClient();
  const previousPricesRef = useRef<Record<string, number>>({});

  const query = useQuery({
    queryKey: hyperliquidKeys.priceData(),
    queryFn: (): Asset[] => {
      return queryClient.getQueryData<Asset[]>(hyperliquidKeys.priceData()) || [];
    },
    enabled: assets.length > 0,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (assets.length === 0) {
      return;
    }

    let isMounted = true;

    const handlePriceUpdate = (prices: PriceFeed): void => {
      if (!isMounted) return;

      const timestamp = Date.now();
      const transformedAssets = transformAssets(assets, prices, previousPricesRef.current, timestamp);

      queryClient.setQueryData(hyperliquidKeys.priceData(), transformedAssets);

      const currentHistory = queryClient.getQueryData<PriceHistory>(hyperliquidKeys.priceHistory()) || {};
      const updatedHistory = { ...currentHistory };

      transformedAssets.forEach(asset => {
        if (!updatedHistory[asset.id]) {
          updatedHistory[asset.id] = [];
        }
        updatedHistory[asset.id].push({ price: asset.price, timestamp });
        if (updatedHistory[asset.id].length > 1000) {
          updatedHistory[asset.id] = updatedHistory[asset.id].slice(-1000);
        }
      });
      queryClient.setQueryData(hyperliquidKeys.priceHistory(), updatedHistory);

      Object.entries(prices).forEach(([symbol, price]) => {
        previousPricesRef.current[symbol] = parseFloat(price);
      });
    };

    console.log('🔌 [usePriceData] Subscribing to Hyperliquid allMids...');
    const unsubscribe = hyperliquid.subscribeToAllMids(handlePriceUpdate);

    return (): void => {
      isMounted = false;
      console.log('🔌 [usePriceData] Unsubscribing from Hyperliquid allMids.');
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [assets, queryClient]);

  return query;
}

// Order Book Hook - Real-time WebSocket updates
export function useOrderBook(coin?: string): UseQueryResult<OrderBook | null, Error> {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: hyperliquidKeys.orderBook(coin),
    queryFn: (): OrderBook | null => {
      return queryClient.getQueryData<OrderBook>(hyperliquidKeys.orderBook(coin)) || null;
    },
    enabled: !!coin,
    staleTime: 1000,
    gcTime: 1000 * 60 * 5,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!coin) return;

    let isSubscribed = true;

    const handleOrderBookUpdate = (orderBook: OrderBook): void => {
      if (!isSubscribed || orderBook.coin !== coin) return;
      queryClient.setQueryData(hyperliquidKeys.orderBook(coin), orderBook);
    };

    console.log(`📊 Subscribing to order book for ${coin}`);
    hyperliquid.subscribeToL2Book(coin, handleOrderBookUpdate);

    return (): void => {
      isSubscribed = false;
      hyperliquid.unsubscribeFromL2Book(coin);
      console.log(`📊 Unsubscribed from order book for ${coin}`);
    };
  }, [coin, queryClient]);

  return query;
}