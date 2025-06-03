// src/hooks/hyperliquid/useHyperliquidOrders.ts
import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { useSignTypedData, useSwitchChain } from 'wagmi';
import { hyperliquidOrders, OrderRequest as ServiceOrderRequest, OrderResponse as ServiceOrderResponse, SignTypedDataFunction as ServiceSignTypedDataFunction } from '@/service/hyperliquidOrders'; // Aliased to avoid name clash if local types exist
import {
    hyperliquidKeys,
    handleApiError,
    PlaceOrderParams, // Assuming this includes { request: ServiceOrderRequest, signTypedDataAsync: ServiceSignTypedDataFunction, userAddress: string, currentMarketPrice?: number }
    CancelOrderParams, // Assuming this includes { asset: string; orderId: string; signTypedDataAsync: ServiceSignTypedDataFunction; userAddress: string }
} from '@/lib/utils';
import { Address, Chain } from 'viem';
import { Asset } from '@/lib/types';

// Re-export or use aliased types if needed locally, otherwise service types are used.
export type OrderRequest = ServiceOrderRequest;
export type OrderResponse = ServiceOrderResponse;


export interface ExplicitClosePositionParams {
    cloid: string;
    // signTypedDataAsync and userAddress are available from useAccount and useSignTypedData hook context
    // but explicitClosePositionByCloid in service doesn't directly take them as it uses initialized agent.
}

export interface ExplicitClosePositionResponse {
    success: boolean;
    exitPrice?: number;
    error?: string;
}

export interface UseHyperliquidOrderMutations {
    placePredictionOrder: UseMutationResult<OrderResponse, Error, PlaceOrderParams, unknown>;
    cancelOrder: UseMutationResult<boolean, Error, CancelOrderParams, unknown>;
    explicitClosePosition: UseMutationResult<ExplicitClosePositionResponse, Error, ExplicitClosePositionParams, unknown>;
}

export interface UseHyperliquidOrdersReturn {
    placePredictionOrder: (params: { request: OrderRequest, currentMarketPrice?: number }) => Promise<OrderResponse>;
    cancelOrder: (params: { asset: string; orderId: string }) => Promise<boolean>;
    explicitClosePosition: (params: ExplicitClosePositionParams) => Promise<ExplicitClosePositionResponse>;
    mutations: UseHyperliquidOrderMutations;
    isProcessingOrder: boolean;
    isCancellingOrder: boolean;
    isClosingPosition: boolean;
}

export function useHyperliquidOrders(address: Address | undefined, isWalletConnected: boolean, chain: Chain | undefined): UseHyperliquidOrdersReturn {
    const queryClient = useQueryClient();
    const { signTypedDataAsync } = useSignTypedData();
    const { switchChainAsync } = useSwitchChain();

    const placePredictionOrderMutation = useMutation<OrderResponse, Error, PlaceOrderParams, unknown>({
        mutationFn: async ({ request, signTypedDataAsync: signData, userAddress, currentMarketPrice }: PlaceOrderParams): Promise<OrderResponse> => {
            if (!request.price || request.price === 0) {
                if (currentMarketPrice) {
                    request.price = currentMarketPrice;
                } else {
                    const priceData = queryClient.getQueryData<Asset[]>(hyperliquidKeys.priceData());
                    const assetPriceInfo = priceData?.find(a => a.id === request.asset);
                    if (!assetPriceInfo?.price) {
                        return { success: false, error: `No current price available for ${request.asset}` };
                    }
                    request.price = assetPriceInfo.price;
                }
            }
            // Ensure signData (from hook's signTypedDataAsync) is correctly typed for the service
            const serviceSignData = signData as ServiceSignTypedDataFunction;
            return hyperliquidOrders.placePredictionOrder(request, serviceSignData, userAddress);
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
        mutationFn: async ({ asset, orderId }: CancelOrderParams): Promise<boolean> => {
            return hyperliquidOrders.cancelOrder(asset, orderId);
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

    const explicitClosePositionMutation = useMutation<ExplicitClosePositionResponse, Error, ExplicitClosePositionParams, unknown>({
        mutationFn: async ({ cloid }: ExplicitClosePositionParams): Promise<ExplicitClosePositionResponse> => {
            // Agent initialization should have happened when placing the order or via other app flows.
            // The service's explicitClosePositionByCloid uses the existing agent.
            return hyperliquidOrders.explicitClosePositionByCloid(cloid);
        },
        onSuccess: (result, variables) => {
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: hyperliquidKeys.positions(address) });
                console.log(`✅ Position ${variables.cloid} explicitly closed, refreshing positions. Exit: $${result.exitPrice}`);
            } else {
                console.warn(`⚠️ Position ${variables.cloid} explicit close reported success:false by API:`, result.error);
            }
        },
        onError: (error: Error, variables) => {
            const apiError = handleApiError(error);
            console.error(`❌ Position ${variables.cloid} explicit close mutation failed:`, apiError.message, apiError.details);
        },
    });

    const placePredictionOrder = async ({ request, currentMarketPrice }: { request: OrderRequest, currentMarketPrice?: number }): Promise<OrderResponse> => {
        if (!isWalletConnected || !address || !signTypedDataAsync) {
            return { success: false, error: 'Wallet not connected or signature function unavailable.' };
        }

        const maxLeverage = request.asset === 'BTC' ? 40 : request.asset === 'ETH' ? 25 : 50;
        if (request.leverage && request.leverage > maxLeverage) {
            return { success: false, error: `Maximum leverage for ${request.asset} is ${maxLeverage}x` };
        }
        if (request.leverage && request.leverage <= 0) {
            console.warn(`Invalid leverage ${request.leverage} for ${request.asset}, defaulting to 20x.`);
            request.leverage = 20; // Default or handle error
        }


        const expectedChainId = hyperliquidOrders.getApiUrl().includes('testnet') ? 421614 : 42161; // Assuming mainnet Arbitrum One
        if (chain?.id !== expectedChainId) {
            if (switchChainAsync) {
                try {
                    await switchChainAsync({ chainId: expectedChainId });
                } catch (switchError: unknown) {
                    const handledError = handleApiError(switchError);
                    return { success: false, error: `Please switch to ${expectedChainId === 421614 ? 'Arbitrum Sepolia' : 'Arbitrum One'}. Error: ${handledError.message}` };
                }
            } else {
                return { success: false, error: `Please switch to ${expectedChainId === 421614 ? 'Arbitrum Sepolia' : 'Arbitrum One'}. Wallet does not support chain switching.` };
            }
        }

        try {
            return await placePredictionOrderMutation.mutateAsync({
                request,
                signTypedDataAsync,
                userAddress: address,
                currentMarketPrice,
            });
        } catch (error) {
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

    const explicitClosePosition = async ({ cloid }: ExplicitClosePositionParams): Promise<ExplicitClosePositionResponse> => {
        if (!isWalletConnected || !address) { // signTypedDataAsync not directly needed for this call to service, but wallet must be connected.
            return { success: false, error: 'Wallet not connected for closing position.' };
        }
        try {
            return await explicitClosePositionMutation.mutateAsync({ cloid });
        } catch (error) {
            const handledError = handleApiError(error);
            return { success: false, error: `Failed to initiate close for position ${cloid}: ${handledError.message}` };
        }
    };

    return {
        placePredictionOrder,
        cancelOrder,
        explicitClosePosition,
        mutations: {
            placePredictionOrder: placePredictionOrderMutation,
            cancelOrder: cancelOrderMutation,
            explicitClosePosition: explicitClosePositionMutation,
        },
        isProcessingOrder: placePredictionOrderMutation.isPending,
        isCancellingOrder: cancelOrderMutation.isPending,
        isClosingPosition: explicitClosePositionMutation.isPending,
    };
}