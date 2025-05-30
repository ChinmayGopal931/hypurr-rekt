// src/hooks/useWalletOrders.ts
import { useState, useEffect, useCallback } from 'react'
import { hyperliquidOrders, OrderRequest, OrderResponse, PositionInfo } from '@/service/hyperliquidOrders'
import { WalletInfo, walletService } from '@/service/wallet'

export interface UseWalletOrdersReturn {
  // Wallet state
  wallet: WalletInfo | null
  isConnecting: boolean
  walletError: string | null
  
  // Order state
  isPlacingOrder: boolean
  orderError: string | null
  activePositions: PositionInfo[]
  
  // Actions
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  placePredictionOrder: (request: OrderRequest) => Promise<OrderResponse>
  
  // Utils
  canPlaceOrder: boolean
}

export function useWalletOrders(): UseWalletOrdersReturn {
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [activePositions, setActivePositions] = useState<PositionInfo[]>([])

  // Check for existing wallet connection on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const walletInfo = await walletService.getWalletInfo()
        if (walletInfo?.isConnected) {
          setWallet(walletInfo)
          console.log('Existing wallet connection found:', walletInfo.address)
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error)
      }
    }

    checkExistingConnection()
  }, [])

  // Update active positions periodically
  useEffect(() => {
    const updatePositions = () => {
      const positions = hyperliquidOrders.getActivePositions()
      setActivePositions(positions)
      
      if (positions.length > 0) {
        console.log('Active positions:', positions.length)
      }
    }

    updatePositions()
    
    // Update every 2 seconds to track position status
    const interval = setInterval(updatePositions, 2000)
    
    return () => clearInterval(interval)
  }, [])

  // Connect wallet
  const connectWallet = useCallback(async () => {
    setIsConnecting(true)
    setWalletError(null)

    try {
      if (!walletService.isWalletAvailable()) {
        throw new Error('Please install MetaMask or another compatible wallet')
      }

      const walletInfo = await walletService.connectWallet()
      setWallet(walletInfo)
      
      console.log('Wallet connected successfully:', {
        address: walletInfo.address,
        chainId: walletInfo.chainId,
        balance: walletInfo.balance
      })
      
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to connect wallet'
      setWalletError(errorMessage)
      console.error('Wallet connection failed:', error)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    walletService.disconnect()
    setWallet(null)
    setWalletError(null)
    setOrderError(null)
    setActivePositions([])
    
    console.log('Wallet disconnected')
  }, [])

  // Place prediction order
  const placePredictionOrder = useCallback(async (request: OrderRequest): Promise<OrderResponse> => {
    setIsPlacingOrder(true)
    setOrderError(null)

    try {
      if (!wallet?.isConnected) {
        throw new Error('Wallet not connected')
      }

      // Validate request
      if (!request.asset || !request.direction || !request.price) {
        throw new Error('Invalid order request parameters')
      }

      if (activePositions.length > 0) {
        throw new Error('Cannot place order: existing position is still active')
      }

      console.log('Placing prediction order:', {
        asset: request.asset,
        direction: request.direction,
        price: request.price,
        timeWindow: request.timeWindow,
        walletAddress: wallet.address
      })
      
      const response = await hyperliquidOrders.placePredictionOrder(request)
      
      if (!response.success) {
        const errorMessage = response.error || 'Order placement failed'
        setOrderError(errorMessage)
        console.error('Order failed:', errorMessage)
      } else {
        console.log('Order placed successfully:', {
          orderId: response.orderId,
          cloid: response.cloid,
          filled: response.fillInfo?.filled,
          fillPrice: response.fillInfo?.fillPrice
        })
        
        // Clear any previous errors
        setOrderError(null)
        
        // Update positions after successful order
        setTimeout(() => {
          const positions = hyperliquidOrders.getActivePositions()
          setActivePositions(positions)
        }, 1000)
      }

      return response
      
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to place order'
      setOrderError(errorMessage)
      console.error('Order placement failed:', error)
      
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setIsPlacingOrder(false)
    }
  }, [wallet, activePositions])

  // Handle wallet events (account changes, disconnections)
  useEffect(() => {
    const handleAccountsChanged = () => {
      console.log('Wallet accounts changed, refreshing...')
      // Refresh the page to reset state
      window.location.reload()
    }

    const handleChainChanged = () => {
      console.log('Wallet chain changed, refreshing...')
      // Refresh the page to reset state
      window.location.reload()
    }

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', handleChainChanged)
    }

    return () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
        window.ethereum.removeListener('chainChanged', handleChainChanged)
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      walletService.cleanup()
      
      // Clear completed positions periodically
      hyperliquidOrders.clearCompletedPositions()
    }
  }, [])

  // Determine if user can place orders
  const canPlaceOrder = Boolean(
    wallet?.isConnected && 
    !isPlacingOrder && 
    activePositions.length === 0 &&
    !walletError &&
    !orderError
  )

  // Log state changes for debugging
  useEffect(() => {
    console.log('Wallet state updated:', {
      connected: wallet?.isConnected,
      isConnecting,
      isPlacingOrder,
      activePositions: activePositions.length,
      canPlaceOrder,
      walletError,
      orderError
    })
  }, [wallet?.isConnected, isConnecting, isPlacingOrder, activePositions.length, canPlaceOrder, walletError, orderError])

  return {
    // Wallet state
    wallet,
    isConnecting,
    walletError,
    
    // Order state
    isPlacingOrder,
    orderError,
    activePositions,
    
    // Actions
    connectWallet,
    disconnectWallet,
    placePredictionOrder,
    
    // Utils
    canPlaceOrder
  }
}