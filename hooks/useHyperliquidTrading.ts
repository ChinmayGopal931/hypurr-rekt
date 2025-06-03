// src/hooks/hyperliquid/useHyperliquidOrders.ts
import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { useSignTypedData, useSwitchChain } from 'wagmi';
import { hyperliquidOrders } from '@/service/hyperliquidOrders';
import {
    hyperliquidKeys,
    handleApiError,
    PlaceOrderParams,
    CancelOrderParams,
    OrderRequest, // Ensure this is imported or defined
    OrderResponse, // Ensure this is imported or defined
    Asset, // For fetching current price from cache
} from '@/lib/utils'; // Assuming shared.ts is in the same directory
import { Address, Chain } from 'viem';

export interface UseHyperliquidOrderMutations {
    placePredictionOrder: UseMutationResult<OrderResponse, Error, PlaceOrderParams, unknown>;
    cancelOrder: UseMutationResult<boolean, Error, CancelOrderParams, unknown>;
}

export interface UseHyperliquidOrdersReturn {
    placePredictionOrder: (params: { request: OrderRequest, currentMarketPrice?: number }) => Promise<OrderResponse>;
    cancelOrder: (params: { asset: string; orderId: string }) => Promise<boolean>;
    mutations: UseHyperliquidOrderMutations;
    isProcessingOrder: boolean;
    isCancellingOrder: boolean;
}

export function useHyperliquidOrders(address: Address | undefined, isWalletConnected: boolean, chain: Chain | undefined): UseHyperliquidOrdersReturn {
    const queryClient = useQueryClient();
    const { signTypedDataAsync } = useSignTypedData();
    const { switchChainAsync } = useSwitchChain();

    const placePredictionOrderMutation = useMutation<OrderResponse, Error, PlaceOrderParams, unknown>({
        mutationFn: async ({ request, signTypedDataAsync: signData, userAddress, currentMarketPrice }: PlaceOrderParams): Promise<OrderResponse> => {
            // Use current market price if not specified or zero
            if (!request.price || request.price === 0) {
                if (currentMarketPrice) {
                    request.price = currentMarketPrice;
                } else {
                    // Attempt to get current price from cache if not provided
                    const priceData = queryClient.getQueryData<Asset[]>(hyperliquidKeys.priceData());
                    const assetPriceInfo = priceData?.find(a => a.id === request.asset);
                    if (!assetPriceInfo?.price) {
                        return { success: false, error: `No current price available for ${request.asset}` };
                    }
                    request.price = assetPriceInfo.price;
                }
            }
            return hyperliquidOrders.placePredictionOrder(request, signData, userAddress);
        },
        onSuccess: (result: OrderResponse): void => {
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: hyperliquidKeys.positions(address) });
                console.log('✅ Order placed successfully, refreshing positions');
            } else {
                console.warn('⚠️ Order placement reported success:false by API:', result.error);
            }
        },
        onError: (error: Error): void => {
            const apiError = handleApiError(error);
            console.error('❌ Order placement mutation failed:', apiError.message, apiError.details);
        },
    });

    const cancelOrderMutation = useMutation<boolean, Error, CancelOrderParams, unknown>({
        mutationFn: async ({ asset, orderId, signTypedDataAsync: signData, userAddress }: CancelOrderParams): Promise<boolean> => {
            return hyperliquidOrders.cancelOrder(asset, orderId, signData, userAddress);
        },
        onSuccess: (success: boolean): void => {
            if (success) {
                queryClient.invalidateQueries({ queryKey: hyperliquidKeys.positions(address) });
                console.log('✅ Order cancelled successfully, refreshing positions');
            } else {
                console.warn('⚠️ Order cancellation reported success:false by API');
            }
        },
        onError: (error: Error): void => {
            const apiError = handleApiError(error);
            console.error('❌ Order cancellation mutation failed:', apiError.message, apiError.details);
        },
    });

    const placePredictionOrder = async ({ request, currentMarketPrice }: { request: OrderRequest, currentMarketPrice?: number }): Promise<OrderResponse> => {
        if (!isWalletConnected || !address || !signTypedDataAsync) {
            return { success: false, error: 'Wallet not connected or signature function unavailable.' };
        }

        // Leverage validation (example, adjust as per actual limits)
        const maxLeverage = request.asset === 'BTC' ? 40 : request.asset === 'ETH' ? 25 : 50; // Example values
        if (request.leverage && request.leverage > maxLeverage) {
            return { success: false, error: `Maximum leverage for ${request.asset} is ${maxLeverage}x` };
        }

        // Network validation (Arbitrum Sepolia testnet example)
        const expectedChainId = 421614;
        if (chain?.id !== expectedChainId) {
            if (switchChainAsync) {
                try {
                    await switchChainAsync({ chainId: expectedChainId });
                    // Re-check chain after switch attempt if necessary, or rely on UI update
                } catch (switchError: unknown) {
                    const handledError = handleApiError(switchError);
                    return { success: false, error: `Please switch to Arbitrum Sepolia. Error: ${handledError.message}` };
                }
            } else {
                return { success: false, error: 'Please switch to Arbitrum Sepolia. Wallet does not support chain switching or switchChainAsync is undefined.' };
            }
        }



        try {
            return await placePredictionOrderMutation.mutateAsync({
                request,
                signTypedDataAsync,
                userAddress: address,
                currentMarketPrice, // Pass it to the mutation function
            });
        } catch (error) { // This catches errors if mutateAsync itself throws (e.g., network issues before mutationFn runs)
            const handledError = handleApiError(error);
            return { success: false, error: handledError.message };
        }
    };

    const cancelOrder = async ({ asset, orderId }: { asset: string; orderId: string }): Promise<boolean> => {
        if (!isWalletConnected || !address || !signTypedDataAsync) {
            console.error('Wallet not connected for cancelling order.');
            return false;
        }

        try {
            return await cancelOrderMutation.mutateAsync({
                asset,
                orderId,
                signTypedDataAsync,
                userAddress: address,
            });
        } catch (error) {
            const handledError = handleApiError(error);
            console.error('Order cancellation failed:', handledError.message);
            return false;
        }
    };

    return {
        placePredictionOrder,
        cancelOrder,
        mutations: {
            placePredictionOrder: placePredictionOrderMutation,
            cancelOrder: cancelOrderMutation,
        },
        isProcessingOrder: placePredictionOrderMutation.isPending,
        isCancellingOrder: cancelOrderMutation.isPending,
    };
}