// Updated GameInterface.tsx with typed hooks and best practices
import { useState, useEffect, useCallback } from 'react'
import { Card } from './ui/card'
import { AssetSelector } from './AssetSelector'
import { PriceDisplay } from './PriceDisplay'
import { GameTimer } from './GameTimer'
import { GameState, GameStats } from '@/app/page'
import { CombinedSettingsSelector } from './TimeWindow'
import { PredictionButtons } from './Prediction'
import { ResultDisplay } from './ResultsDisplay'
import { GameCompletionModal } from './CompleteModal'
import { useHyperliquid, usePositions } from '@/hooks/useHyperliquid'
import { AlertTriangle, DollarSign, RefreshCw, TrendingUp, Loader2 } from 'lucide-react'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { WalletConnection } from './WalletConnection'
import { AgentStatus } from './AgentStatus'
import { DepositRequiredAlert } from './DepositAlert'
import { GameInterfaceSkeleton } from './PriceSkeleton'
import { motion, AnimatePresence } from 'framer-motion'
import type { OrderRequest, OrderResponse } from '@/service/hyperliquidOrders'
import { useHyperliquidOrders } from '@/hooks/useHyperliquidTrading'
import { useAccount } from 'wagmi'
import { Prediction, Asset } from '@/lib/types'

interface GameInterfaceProps {
  gameState: GameState
  setGameState: (state: GameState) => void
  currentPrediction: Prediction | null
  setCurrentPrediction: (prediction: Prediction | null) => void
  gameStats: GameStats
  setGameStats: (stats: GameStats) => void
  soundEnabled: boolean
}

interface CompletionData {
  prediction: Prediction
  exitPrice: number
  leverage: number
  positionValue: number
}

interface OrderError {
  message: string
  type: 'deposit' | 'network' | 'general'
  code?: string
}

export function GameInterface({
  gameState,
  setGameState,
  currentPrediction,
  setCurrentPrediction,
  gameStats,
  setGameStats,
}: GameInterfaceProps) {
  // Local state with proper typing
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [timeWindow, setTimeWindow] = useState<number>(30)
  const [countdownTime, setCountdownTime] = useState<number>(0)
  const [walletReady, setWalletReady] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<OrderError | null>(null)
  const [needsDeposit, setNeedsDeposit] = useState(false)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [completionData, setCompletionData] = useState<CompletionData | null>(null)
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false)
  const [activePositionCloid, setActivePositionCloid] = useState<string | null>(null)

  const { address, isConnected: isWalletConnected, chain } = useAccount()


  // Main Hyperliquid hook with all functionality
  const {
    assets,
    error,
    isConnected: hlConnected,
    onPositionResult,
    getCurrentPrice,
    calculatePositionSize,
    queries
  } = useHyperliquid(address)

  const {
    mutations,
    placePredictionOrder
  } = useHyperliquidOrders(address, isWalletConnected, chain)



  // Separate positions hook for better performance
  const positionsQuery = usePositions(address)
  const activePositions = positionsQuery.data || []

  // Derived state for order placement capability
  const canPlaceOrder = Boolean(
    isWalletConnected &&
    address &&
    walletReady &&
    !mutations.placePredictionOrder.isPending &&
    !isPlacingOrder &&
    activePositions.length === 0 &&
    !orderError &&
    hlConnected
  )

  // Set default selected asset when assets load
  useEffect(() => {
    if (assets.length > 0 && !selectedAsset) {
      const btcAsset = assets.find(asset => asset.id === 'BTC')
      setSelectedAsset(btcAsset || assets[0])
    } else if (activePositions.length === 0) {
      setOrderError(null)
      setNeedsDeposit(false)
    } else if (selectedAsset && assets.length > 0) {
      const updatedAsset = assets.find(a => a.id === selectedAsset.id)
      if (updatedAsset && updatedAsset.price !== selectedAsset.price) {
        setSelectedAsset(updatedAsset)
      }
    }
  }, [activePositions.length, assets, selectedAsset])


  // Error handling utility with proper typing
  const handleOrderError = useCallback((error: unknown): OrderError => {
    if (error instanceof Error) {
      const message = error.message

      if (message === 'NEEDS_HYPERLIQUID_DEPOSIT' || message.includes('ACCOUNT_NOT_FOUND')) {
        return { message, type: 'deposit' }
      }

      if (message.includes('network') || message.includes('chain') || message.includes('ChainId')) {
        return { message, type: 'network' }
      }

      return { message, type: 'general' }
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      return { message: String(error.message), type: 'general' }
    }

    return { message: 'An unknown error occurred', type: 'general' }
  }, [])

  // Fixed GameInterface.tsx - Update handlePrediction to disable service auto-close


  // Enhanced handleGameComplete with modal
  const handleGameComplete = useCallback((result: 'win' | 'loss', exitPrice: number, positionValue: number): void => {
    if (!currentPrediction) return

    const updatedPrediction = {
      ...currentPrediction,
      result,
      exitPrice
    }

    setCurrentPrediction(updatedPrediction)

    // ADD: Clear the active position cloid since game is complete
    setActivePositionCloid(null)

    // Set completion data and show modal
    setCompletionData({
      prediction: updatedPrediction,
      exitPrice,
      leverage: selectedAsset?.maxLeverage || 1,
      positionValue
    })
    setShowCompletionModal(true)

    // Update stats
    const newStats = { ...gameStats }
    newStats.totalGames++

    if (result === 'win') {
      newStats.wins++
      newStats.currentStreak++
      newStats.bestStreak = Math.max(newStats.bestStreak, newStats.currentStreak)
    } else {
      newStats.losses++
      newStats.currentStreak = 0
    }

    newStats.winRate = (newStats.wins / newStats.totalGames) * 100
    setGameStats(newStats)

    console.log(`Trade completed: ${result.toUpperCase()} at $${exitPrice}`)
  }, [currentPrediction, gameStats, setGameStats])


  const handlePrediction = useCallback(async (direction: 'up' | 'down'): Promise<void> => {
    if (!selectedAsset || !canPlaceOrder) return

    try {
      setIsPlacingOrder(true)
      setOrderError(null)
      setGameState('countdown')
      setCountdownTime(3)

      // Countdown delay
      await new Promise(resolve => setTimeout(resolve, 3000))

      try {
        const currentPrice = getCurrentPrice(selectedAsset.id)
        if (!currentPrice) {
          throw new Error(`No current price available for ${selectedAsset.id}`)
        }

        const positionCalc = await calculatePositionSize(selectedAsset.id, selectedAsset.maxLeverage)
        console.log('Position calculation:', positionCalc)

        const orderRequest: OrderRequest = {
          asset: selectedAsset.id,
          direction,
          price: currentPrice,
          size: positionCalc?.assetSize || '10',
          timeWindow: 0, // ✅ CHANGED: Set to 0 so GameTimer controls timing
          leverage: selectedAsset.maxLeverage
        }

        console.log('Placing prediction order with leverage (GameTimer will manage closure):', {
          ...orderRequest,
          uiTimeWindow: timeWindow, // Log the UI timeWindow for reference
          estimatedUsdValue: positionCalc?.usdValue || 'unknown'
        })

        const response: OrderResponse = await placePredictionOrder({ request: orderRequest, currentMarketPrice: currentPrice })

        if (response.success) {
          if (response.fillInfo?.filled) {
            const prediction: Prediction = {
              id: response.cloid || Date.now().toString(),
              asset: selectedAsset,
              direction,
              leverage: selectedAsset?.maxLeverage || 1,
              entryPrice: response.fillInfo.fillPrice || currentPrice,
              timeWindow, // ✅ Keep the UI timeWindow for GameTimer
              timestamp: Date.now()
            }

            setCurrentPrediction(prediction)

            // Store the active position cloid
            if (response.cloid) {
              setActivePositionCloid(response.cloid)
            }

            setGameState('active')
            setOrderError(null)

            // Show success feedback
            setShowSuccessFeedback(true)
            setTimeout(() => setShowSuccessFeedback(false), 3000)

            console.log('✅ Order filled immediately with leverage (GameTimer will handle closure):', {
              orderId: response.orderId,
              cloid: response.cloid,
              fillPrice: response.fillInfo.fillPrice,
              entryPrice: prediction.entryPrice,
              leverage: `${selectedAsset?.maxLeverage}x`,
              estimatedPositionValue: positionCalc?.usdValue,
              uiTimeWindow: timeWindow,
              serviceTimeWindow: 0
            })

            if (response.cloid) {
              onPositionResult(response.cloid, (result, exitPrice) => {
                console.log(`🎯 Position result: ${result.toUpperCase()} - Entry: $${prediction.entryPrice} → Exit: $${exitPrice}`)
                handleGameComplete(result, exitPrice, positionCalc?.usdValue || 400)
              })
            }
          } else {
            // Handle resting order
            const prediction: Prediction = {
              id: response.cloid || Date.now().toString(),
              asset: selectedAsset,
              direction,
              entryPrice: currentPrice,
              timeWindow, // ✅ Keep the UI timeWindow for GameTimer
              timestamp: Date.now()
            }

            setCurrentPrediction(prediction)

            // Store the active position cloid for resting orders too
            if (response.cloid) {
              setActivePositionCloid(response.cloid)
            }

            setGameState('active')
            setOrderError(null)

            if (response.cloid) {
              onPositionResult(response.cloid, (result, exitPrice) => {
                handleGameComplete(result, exitPrice, positionCalc?.usdValue || 400)
              })
            }
          }
        } else {
          // Handle order failure
          const errorMessage = response.error || 'Order failed'
          const typedError = handleOrderError(new Error(errorMessage))

          if (typedError.type === 'deposit') {
            setNeedsDeposit(true)
            setOrderError(null)
          } else {
            setOrderError(typedError)
          }

          setGameState('idle')
          console.error('❌ Order placement failed:', errorMessage)
        }
      } catch (error: unknown) {
        const typedError = handleOrderError(error)
        setOrderError(typedError)
        setGameState('idle')
        console.error('Order placement error:', error)
      } finally {
        setIsPlacingOrder(false)
      }
    } catch (error: unknown) {
      const typedError = handleOrderError(error)
      setOrderError(typedError)
      setGameState('idle')
      setIsPlacingOrder(false)
      console.error('Prediction initiation failed:', error)
    }
  }, [
    selectedAsset,
    canPlaceOrder,
    setGameState,
    getCurrentPrice,
    calculatePositionSize,
    handleGameComplete,
    timeWindow, // Keep timeWindow in dependencies for UI
    placePredictionOrder,
    setCurrentPrediction,
    onPositionResult,
    handleOrderError,
  ])

  // Handle modal close and play again
  const handleModalClose = useCallback((): void => {
    setShowCompletionModal(false)
    setGameState('result')

    // Auto-reset after showing result briefly
    setTimeout(() => {
      setGameState('idle')
      setCurrentPrediction(null)
      setCompletionData(null)
    }, 2000)
  }, [setGameState])

  const handlePlayAgain = useCallback((): void => {
    setShowCompletionModal(false)
    setGameState('idle')
    setCurrentPrediction(null)
    setCompletionData(null)
    // ADD: Clear the active position cloid
    setActivePositionCloid(null)
  }, [setGameState])

  const handleRefresh = useCallback((): void => {
    window.location.reload()
  }, [])

  const clearError = useCallback((): void => {
    if (gameState === 'idle') {
      setOrderError(null)
      setNeedsDeposit(false)
    }
  }, [gameState])

  // Destructure query states for clarity
  const { assetMetadata: assetMetadataQuery, priceData: priceDataQueryInfo } = queries;


  const showSkeleton =
    assetMetadataQuery.isLoading ||
    (assetMetadataQuery.isSuccess &&
      (priceDataQueryInfo.isLoading || // Covers if useQuery for priceData is actively running its queryFn
        (!priceDataQueryInfo.isError && assets.length === 0) // Covers waiting for WebSocket when queryFn is done but no assets yet
      )
    );

  if (showSkeleton) {
    return <GameInterfaceSkeleton />;
  }

  // Error Condition (after skeleton check):
  // This `combinedErrorFromHook` is (assetMetadataQuery.error || priceDataQuery.error) from useHyperliquid.
  // It will be true if either metadata fetching failed or price data fetching/processing failed.
  if (error) {
    return (
      <div className="space-y-6">
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            <div className="font-semibold mb-1">Connection Failed</div>
            {/* Display the actual error message from the hook */}
            <div className="text-sm">
              {typeof error === 'string' ? error :
                (error as Error)?.message || 'An unknown connection error occurred.'}
            </div>
            {/* Specific query errors if available and not redundant */}
            {assetMetadataQuery.error && assetMetadataQuery.error.message !== (error as unknown as Error)?.message && (
              <div className="text-xs mt-1 text-red-300">
                Metadata error: {assetMetadataQuery.error.message}
              </div>
            )}
            {priceDataQueryInfo.error && priceDataQueryInfo.error.message !== (error as unknown as Error)?.message && (
              <div className="text-xs mt-1 text-red-300">
                Price feed error: {priceDataQueryInfo.error.message}
              </div>
            )}
          </AlertDescription>
        </Alert>
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <div className="text-slate-400">
              Unable to load real-time market data.
            </div>
            <Button
              onClick={handleRefresh} // Assuming handleRefresh is defined
              variant="outline"
              disabled={assetMetadataQuery.isRefetching || priceDataQueryInfo.isRefetching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${assetMetadataQuery.isRefetching || priceDataQueryInfo.isRefetching ? 'animate-spin' : ''}`} />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // No Assets Condition (after skeleton and error checks):
  // At this point:
  // - Not showing skeleton (implies metadata is loaded, and we're not in the initial phase of waiting for prices/assets via WebSocket).
  // - No `combinedErrorFromHook` that would render the error display above.
  // So, if `assets` is still empty, it means no tradable assets were found or streamed after everything settled.
  if (assets.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto" />
            <div className="text-white text-lg font-semibold">No Trading Assets Available</div>
            <div className="text-slate-400 text-sm">
              Could not fetch any assets from Hyperliquid, or none are currently tradable. Please try refreshing.
            </div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" onClick={clearError}>
      {/* Game Completion Modal */}
      {true && completionData && (
        <GameCompletionModal
          isOpen={true}
          onClose={handleModalClose}
          onPlayAgain={handlePlayAgain}
          prediction={completionData.prediction as Prediction}
          actualExitPrice={completionData.exitPrice}
          gameStats={gameStats}
          leverage={completionData.leverage}
          positionValue={completionData.positionValue}
        />
      )}
      {/* Success Feedback Animation */}
      <AnimatePresence>
        {showSuccessFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50"
          >
            <Card className="p-4 bg-green-500/20 border-green-500/50 backdrop-blur-sm">
              <div className="flex items-center space-x-2 text-green-400">
                <TrendingUp className="w-5 h-5" />
                <span className="font-semibold">Order Placed Successfully!</span>
              </div>
              <div className="text-sm text-green-300 mt-1">
                Position opened with {selectedAsset?.maxLeverage}x leverage
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wallet Connection */}
      <WalletConnection onWalletReady={() => setWalletReady(true)} />

      {/* Agent Status */}
      {address && (
        <AgentStatus userAddress={address} isConnected={isWalletConnected} />
      )}


      {/* Order Error Display with Enhanced Typing */}
      {orderError && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold mb-1">Order Failed</div>
                <div className="text-sm">{orderError.message}</div>
                <div className="text-xs mt-1 text-slate-400">
                  Error type: {orderError.type}
                  {orderError.code && ` • Code: ${orderError.code}`}
                </div>
              </div>
              <Button
                onClick={clearError}
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Deposit Required Alert */}
      {needsDeposit && address && (
        <DepositRequiredAlert
          userAddress={address}
          onDismiss={() => setNeedsDeposit(false)}
        />
      )}

      {/* Active Position Alert with Query States */}
      {activePositions.length > 0 && (
        <Alert className="border-blue-500/50 bg-blue-500/10">
          <DollarSign className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-400">
            <div className="font-semibold mb-1">Active Position</div>
            <div className="text-sm">
              You have {activePositions.length} active position(s).
              Wait for it to close before placing a new prediction.
            </div>
            <div className="mt-2 space-y-1">
              {activePositions.map(position => (
                <div key={position.cloid} className="text-xs bg-blue-500/20 rounded p-2">
                  {position.asset} {position.direction.toUpperCase()} - Entry: ${position.entryPrice}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Price Display */}
      {selectedAsset && isWalletConnected && (
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <PriceDisplay
            asset={selectedAsset}
            gameState={gameState}
            prediction={currentPrediction}
          />
        </Card>
      )}

      {/* Game Controls */}
      {isWalletConnected && (gameState === 'idle' || gameState === 'countdown') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 bg-slate-900/50 border-slate-800">
            <AssetSelector
              assets={assets}
              selectedAsset={selectedAsset}
              onAssetSelect={setSelectedAsset}
              disabled={gameState !== 'idle' || !canPlaceOrder}
            />
          </Card>

          <Card className="p-6 bg-slate-900/50 border-slate-800">
            <CombinedSettingsSelector
              timeWindow={timeWindow}
              onTimeWindowSelect={setTimeWindow}
              leverage={selectedAsset?.maxLeverage || 1}
              disabled={gameState !== 'idle' || !canPlaceOrder}
              selectedAsset={selectedAsset}
            />
          </Card>
        </div>
      )}

      {/* Prediction Buttons or Game Status */}
      {isWalletConnected && (
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          {gameState === 'idle' && (
            <PredictionButtons
              onPredict={handlePrediction}
              disabled={!selectedAsset || !hlConnected || !canPlaceOrder || mutations.placePredictionOrder.isPending}
            />
          )}

          {gameState === 'countdown' && (
            <div className="text-center space-y-4">
              <div className="text-2xl font-bold text-white">
                Placing Order...
              </div>
              <GameTimer
                initialTime={countdownTime}
                onComplete={() => { }}
                type="countdown"
              />
              <div className="text-sm text-slate-400 space-y-1">
                <div>
                  {mutations.placePredictionOrder.isPending ? 'Sending order to Hyperliquid...' :
                    isPlacingOrder ? 'Processing order...' : 'Get ready!'}
                </div>

              </div>
            </div>
          )}

          {/* Only show timer if game is active AND modal is NOT showing */}
          {gameState === 'active' && currentPrediction && selectedAsset && !showCompletionModal && (
            <GameTimer
              initialTime={timeWindow}
              onComplete={() => {
                // Force completion if timer expires
                if (selectedAsset) {
                  handleGameComplete('loss', selectedAsset.price, 400)
                }
              }}
              type="game"
              prediction={currentPrediction}
              currentPrice={selectedAsset.price}
              existingPositionCloid={activePositionCloid} // ADD: Pass the cloid
            />
          )}

          {/* Show completion message when transitioning */}
          {gameState === 'result' && !showCompletionModal && (
            <div className="text-center space-y-4">
              <div className="text-2xl font-bold text-white">Game Complete!</div>
              <div className="animate-pulse">
                <div className="w-8 h-8 bg-blue-500 rounded-full mx-auto"></div>
              </div>
            </div>
          )}

          {gameState === 'result' && currentPrediction && !showCompletionModal && (
            <ResultDisplay
              prediction={currentPrediction}
              onPlayAgain={handlePlayAgain}
            />
          )}
        </Card>
      )}

      {/* Margin Requirement Alert */}
      {isWalletConnected && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <DollarSign className="h-4 w-4 text-orange-400" />
          <AlertDescription className="text-orange-400">
            <div className="font-semibold mb-1">Margin Requirement</div>
            <div className="text-sm space-y-1">
              <div>Each trade requires $10 USDC margin in your Hyperliquid account</div>
              <div className="flex items-center space-x-4">
                <span>40x leverage = $400 position</span>
                <span>•</span>
                <span>Max BTC leverage: 40x</span>
                <span>•</span>
                <span>Max ETH leverage: 25x</span>
              </div>
              <div className="text-xs text-orange-300 mt-2">
                Make sure you have at least $10+ USDC in your Hyperliquid account before trading
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Attribution */}
      <div className="text-center text-xs text-slate-500 space-y-1">
        <div>
          Real-time data and trading via{' '}
          <a
            href="https://hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline transition-colors"
          >
            Hyperliquid
          </a>
        </div>
        <div className="flex items-center justify-center space-x-2">
          <Badge variant="outline" className="text-xs px-2 py-0.5">
            Testnet
          </Badge>
          <span>•</span>
          <span>$10 margin per trade</span>
          <span>•</span>
          <span>True leverage up to 40x</span>
          <span>•</span>
          <span>Max position: $400</span>
        </div>
      </div>

      {/* Mutation Loading Overlay */}
      {mutations.placePredictionOrder.isPending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 bg-slate-900 border-slate-700">
            <div className="flex items-center space-x-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-white">Processing order on Hyperliquid...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}