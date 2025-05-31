// // src/hooks/useOrders.ts
// import { useState, useEffect, useCallback } from 'react'
// import { useAccount, useWalletClient } from 'wagmi'
// import { hyperliquidOrders, OrderRequest, OrderResponse, PositionInfo } from '@/service/hyperliquidOrders'

// export interface UseOrdersReturn {
//   // Order state
//   isPlacingOrder: boolean
//   orderError: string | null
//   activePositions: PositionInfo[]
  
//   // Actions
//   placePredictionOrder: (request: OrderRequest) => Promise<OrderResponse>
  
//   // Utils
//   canPlaceOrder: boolean
// }

// export function useOrders(): UseOrdersReturn {
//   const { address, isConnected } = useAccount()
//   const { data: walletClient } = useWalletClient()
  
//   const [isPlacingOrder, setIsPlacingOrder] = useState(false)
//   const [orderError, setOrderError] = useState<string | null>(null)
//   const [activePositions, setActivePositions] = useState<PositionInfo[]>([])

//   // Update active positions periodically
//   useEffect(() => {
//     const updatePositions = () => {
//       const positions = hyperliquidOrders.getActivePositions()
//       setActivePositions(positions)
      
//       if (positions.length > 0) {
//         console.log('Active positions:', positions.length)
//       }
//     }

//     updatePositions()
    
//     // Update every 2 seconds to track position status
//     const interval = setInterval(updatePositions, 2000)
    
//     return () => clearInterval(interval)
//   }, [])

//   // Place prediction order
//   const placePredictionOrder = useCallback(async (request: OrderRequest): Promise<OrderResponse> => {
//     setIsPlacingOrder(true)
//     setOrderError(null)

//     try {
//       if (!isConnected || !address) {
//         throw new Error('Wallet not connected')
//       }

//       if (!walletClient) {
//         throw new Error('Wallet client not available')
//       }

//       // Validate request
//       if (!request.asset || !request.direction || !request.price) {
//         throw new Error('Invalid order request parameters')
//       }

//       if (activePositions.length > 0) {
//         throw new Error('Cannot place order: existing position is still active')
//       }

//       console.log('Placing prediction order:', {
//         asset: request.asset,
//         direction: request.direction,
//         price: request.price,
//         timeWindow: request.timeWindow,
//         walletAddress: address
//       })
      
//       // Pass the wagmi wallet client to hyperliquid orders
//       const response = await hyperliquidOrders.placePredictionOrder(request)
      
//       if (!response.success) {
//         const errorMessage = response.error || 'Order placement failed'
//         setOrderError(errorMessage)
//         console.error('Order failed:', errorMessage)
//       } else {
//         console.log('Order placed successfully:', {
//           orderId: response.orderId,
//           cloid: response.cloid,
//           filled: response.fillInfo?.filled,
//           fillPrice: response.fillInfo?.fillPrice
//         })
        
//         // Clear any previous errors
//         setOrderError(null)
        
//         // Update positions after successful order
//         setTimeout(() => {
//           const positions = hyperliquidOrders.getActivePositions()
//           setActivePositions(positions)
//         }, 1000)
//       }

//       return response
      
//     } catch (error: any) {
//       const errorMessage = error.message || 'Failed to place order'
//       setOrderError(errorMessage)
//       console.error('Order placement failed:', error)
      
//       return {
//         success: false,
//         error: errorMessage
//       }
//     } finally {
//       setIsPlacingOrder(false)
//     }
//   }, [isConnected, address, walletClient, activePositions])

//   // Cleanup on unmount
//   useEffect(() => {
//     return () => {
//       // Clear completed positions periodically
//       hyperliquidOrders.clearCompletedPositions()
//     }
//   }, [])

//   // Determine if user can place orders
//   const canPlaceOrder = Boolean(
//     isConnected && 
//     address &&
//     walletClient &&
//     !isPlacingOrder && 
//     activePositions.length === 0 &&
//     !orderError
//   )

//   // Log state changes for debugging
//   useEffect(() => {
//     console.log('Order state updated:', {
//       connected: isConnected,
//       address,
//       isPlacingOrder,
//       activePositions: activePositions.length,
//       canPlaceOrder,
//       orderError
//     })
//   }, [isConnected, address, isPlacingOrder, activePositions.length, canPlaceOrder, orderError])

//   return {
//     // Order state
//     isPlacingOrder,
//     orderError,
//     activePositions,
    
//     // Actions
//     placePredictionOrder,
    
//     // Utils
//     canPlaceOrder
//   }
// }