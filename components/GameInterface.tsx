// Updated GameInterface.tsx with FIXED P&L calculation for long/short positions
import { useState, useEffect, useCallback } from 'react'
import { Card } from './ui/card'
import { AssetSelector } from './AssetSelector'
import { PriceDisplay } from './PriceDisplay'
import { GameTimer } from './GameTimer'
import { CombinedSettingsSelector } from './TimeWindow'
import { PredictionButtons } from './Prediction'
import { ResultDisplay } from './ResultsDisplay'
import { GameCompletionModal } from './CompleteModal'
import { useHyperliquid, usePositions } from '@/hooks/useHyperliquid'
import { useGameStats } from '@/hooks/useGameStats'
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
import { Prediction, Asset, GameState } from '@/lib/types'

interface GameInterfaceProps {
  gameState: GameState
  setGameState: (state: GameState) => void
  currentPrediction: Prediction | null
  setCurrentPrediction: (prediction: Prediction | null) => void
  soundEnabled: boolean
  audioFunctions?: {
    playMeow: () => void,
    playBeggingMeow?: () => void,
    playWinSound?: () => void,
    playLossSound?: () => void
  }
}

interface CompletionData {
  prediction: Prediction
  exitPrice: number
  leverage: number
  positionValue: number
  actualEntryPrice: number
  positionSize: string
  realPnLDollar?: number
}

interface OrderError {
  message: string
  type: 'deposit' | 'network' | 'general'
  code?: string
}

interface ActiveTradeData {
  cloid: string
  entryPrice: number
  positionSize: string
  leverage: number
  gameId?: string // Database game ID
}

export function GameInterface({
  gameState,
  setGameState,
  currentPrediction,
  setCurrentPrediction,
  soundEnabled,
  audioFunctions
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
  const [activeTradeData, setActiveTradeData] = useState<ActiveTradeData | null>(null)

  const { address, isConnected: isWalletConnected, chain } = useAccount()

  // Database hooks
  const {
    gameStats,
    startGame,
    completeGame,
  } = useGameStats(address)

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

  // Enhanced handleGameComplete with database integration - FIXED P&L calculation
  const handleGameComplete = useCallback(async (
    result: 'win' | 'loss',
    exitPrice: number,
    positionValue: number,
    realEntryPrice?: number,
    realPositionSize?: string,
    realPnLDollar?: number
  ): Promise<void> => {
    if (!currentPrediction) return

    // ✅ Determine ACTUAL result based on real P&L data - FIXED for long/short
    let actualResult: 'win' | 'loss' = result; // Default fallback

    if (realPnLDollar !== undefined) {
      // Use real P&L from API to determine win/loss
      actualResult = realPnLDollar >= 0 ? 'win' : 'loss';
    } else if (realEntryPrice && realPositionSize) {
      // ✅ FIXED: Calculate P&L accounting for trade direction (long vs short)
      const sizeNumber = parseFloat(realPositionSize);
      const calculatedPnL = currentPrediction.direction === 'up'
        ? (exitPrice - realEntryPrice) * sizeNumber  // LONG position
        : (realEntryPrice - exitPrice) * sizeNumber; // SHORT position
      actualResult = calculatedPnL >= 0 ? 'win' : 'loss';
    } else {
      // Fallback: determine based on price movement and prediction direction
      const priceDiff = exitPrice - currentPrediction.entryPrice;
      const didPriceGoUp = priceDiff > 0;
      const predictedUp = currentPrediction.direction === 'up';
      actualResult = didPriceGoUp === predictedUp ? 'win' : 'loss';
    }

    const updatedPrediction = {
      ...currentPrediction,
      result: actualResult, // ✅ Use actual result based on real data
      exitPrice
    }

    // Play the appropriate sound based on the game result
    if (soundEnabled && audioFunctions) {
      if (result === 'win' && audioFunctions.playWinSound) {
        audioFunctions.playWinSound();
        console.log('🐱 Playing win sound for successful trade');
      } else if (result === 'loss' && audioFunctions.playLossSound) {
        audioFunctions.playLossSound();
        console.log('🐱 Playing loss sound for unsuccessful trade');
      }
    }

    setCurrentPrediction(updatedPrediction)
    setActivePositionCloid(null)

    // Use real trade data when available
    const actualEntryPrice = realEntryPrice ?? activeTradeData?.entryPrice ?? currentPrediction.entryPrice
    const actualPositionSize = realPositionSize ?? activeTradeData?.positionSize
    const actualLeverage = activeTradeData?.leverage ?? selectedAsset?.maxLeverage ?? 1

    // ✅ Complete the game in the database with ACTUAL result
    if (activeTradeData?.gameId) {
      try {
        await completeGame(activeTradeData.gameId, actualResult, exitPrice, realPnLDollar)
      } catch (error) {
        console.error('❌ Failed to complete game in database:', error)
      }
    }

    setCompletionData({
      prediction: updatedPrediction,
      exitPrice,
      leverage: actualLeverage,
      positionValue,
      actualEntryPrice,
      positionSize: actualPositionSize ?? '0',
      realPnLDollar
    })
    setShowCompletionModal(true)

    // Clear trade data
    setActiveTradeData(null)

  }, [currentPrediction, activeTradeData, selectedAsset, completeGame])

  const handlePrediction = useCallback(async (direction: 'up' | 'down'): Promise<void> => {
    if (!selectedAsset || !canPlaceOrder) return

    // Play meow sound when position is opened (if sound is enabled)
    if (soundEnabled && audioFunctions?.playMeow) {
      audioFunctions.playMeow();
    }

    try {
      setIsPlacingOrder(true)
      setOrderError(null)
      setGameState('countdown')
      setCountdownTime(3)

      await new Promise(resolve => setTimeout(resolve, 3000))

      try {
        const currentPrice = getCurrentPrice(selectedAsset.id)
        if (!currentPrice) {
          throw new Error(`No current price available for ${selectedAsset.id}`)
        }

        const positionCalc = await calculatePositionSize(selectedAsset.id, selectedAsset.maxLeverage)

        // Create prediction object
        const prediction: Prediction = {
          id: Date.now().toString(),
          asset: selectedAsset,
          direction,
          leverage: selectedAsset.maxLeverage,
          entryPrice: currentPrice,
          timeWindow,
          timestamp: Date.now()
        }

        // Start game in database first
        const gameId = await startGame(
          prediction,
          currentPrice,
          positionCalc?.assetSize,
          selectedAsset.maxLeverage
        )

        if (!gameId) {
          throw new Error('Failed to create game record in database')
        }

        const orderRequest: OrderRequest = {
          asset: selectedAsset.id,
          direction,
          price: currentPrice,
          size: positionCalc?.assetSize || '10',
          timeWindow: 0,
          leverage: selectedAsset.maxLeverage
        }


        const response: OrderResponse = await placePredictionOrder({
          request: orderRequest,
          currentMarketPrice: currentPrice
        })

        if (response.success) {
          if (response.fillInfo?.filled) {
            // Store real trade data from API response
            const realEntryPrice = response.fillInfo.fillPrice || currentPrice
            const realPositionSize = positionCalc?.assetSize || '0'
            const realLeverage = selectedAsset?.maxLeverage || 1

            // Update prediction with real data
            const updatedPrediction: Prediction = {
              ...prediction,
              entryPrice: realEntryPrice,
              leverage: realLeverage
            }

            setCurrentPrediction(updatedPrediction)

            if (response.cloid) {
              setActivePositionCloid(response.cloid)

              // Store real trade data including database game ID
              setActiveTradeData({
                cloid: response.cloid,
                entryPrice: realEntryPrice,
                positionSize: realPositionSize,
                leverage: realLeverage,
                gameId // Store database game ID
              })
            }

            setGameState('active')
            setOrderError(null)
            setShowSuccessFeedback(true)
            setTimeout(() => setShowSuccessFeedback(false), 3000)

            if (response.cloid) {
              onPositionResult(response.cloid, (result, exitPrice) => {
                // ✅ FIXED: Calculate real P&L accounting for trade direction
                let realPnLDollar: number | undefined
                if (realPositionSize && realEntryPrice) {
                  const sizeNumber = parseFloat(realPositionSize)
                  realPnLDollar = direction === 'up'
                    ? (exitPrice - realEntryPrice) * sizeNumber  // LONG position
                    : (realEntryPrice - exitPrice) * sizeNumber; // SHORT position
                }

                handleGameComplete(
                  result,
                  exitPrice,
                  positionCalc?.usdValue || 400,
                  realEntryPrice,
                  realPositionSize,
                  realPnLDollar
                )
              })
            }
          } else {
            // Handle resting order - use original prediction
            setCurrentPrediction(prediction)

            // Store the active position cloid for resting orders too
            if (response.cloid) {
              setActivePositionCloid(response.cloid)
              setActiveTradeData({
                cloid: response.cloid,
                entryPrice: currentPrice,
                positionSize: positionCalc?.assetSize || '0',
                leverage: selectedAsset.maxLeverage,
                gameId
              })
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
    timeWindow,
    placePredictionOrder,
    setCurrentPrediction,
    onPositionResult,
    handleOrderError,
    startGame
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
    setActivePositionCloid(null)
    setActiveTradeData(null)

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
      (priceDataQueryInfo.isLoading ||
        (!priceDataQueryInfo.isError && assets.length === 0)
      )
    );

  if (showSkeleton) {
    return <GameInterfaceSkeleton />;
  }

  // Error Condition
  if (error) {
    return (
      <div className="space-y-6">
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            <div className="font-semibold mb-1">Connection Failed</div>
            <div className="text-sm">
              {typeof error === 'string' ? error :
                (error as Error)?.message || 'An unknown connection error occurred.'}
            </div>
          </AlertDescription>
        </Alert>
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <div className="text-slate-400">
              Unable to load real-time market data.
            </div>
            <Button
              onClick={handleRefresh}
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

  // No Assets Condition
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
      {showCompletionModal && completionData && (
        <GameCompletionModal
          isOpen={showCompletionModal}
          onClose={handleModalClose}
          onPlayAgain={handlePlayAgain}
          prediction={completionData.prediction as Prediction}
          actualExitPrice={completionData.exitPrice}
          gameStats={gameStats}
          leverage={completionData.leverage}
          positionValue={completionData.positionValue}
          actualEntryPrice={completionData.actualEntryPrice}
          positionSize={completionData.positionSize}
          realPnLDollar={completionData.realPnLDollar}
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

      {/* Agent Status */}
      {address && (
        <AgentStatus userAddress={address} isConnected={isWalletConnected} />
      )}

      {/* Order Error Display */}
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

      {/* Active Position Alert */}
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


          {gameState === 'active' && currentPrediction && selectedAsset && !showCompletionModal && (
            <GameTimer
              initialTime={timeWindow}
              onComplete={(realExitPrice?: number) => {
                const finalExitPrice = realExitPrice ?? selectedAsset.price
                const realEntryPrice = activeTradeData?.entryPrice
                const realPositionSize = activeTradeData?.positionSize

                // Calculate real P&L if we have the data
                let realPnLDollar: number | undefined
                if (realEntryPrice && realPositionSize && finalExitPrice) {
                  const sizeNumber = parseFloat(realPositionSize)
                  realPnLDollar = currentPrediction.direction === 'up'
                    ? (finalExitPrice - realEntryPrice) * sizeNumber  // LONG position
                    : (realEntryPrice - finalExitPrice) * sizeNumber; // SHORT position
                }

                handleGameComplete(
                  'loss', // This will be recalculated based on real P&L in handleGameComplete
                  finalExitPrice,
                  400,
                  realEntryPrice,
                  realPositionSize,
                  realPnLDollar
                )
              }}
              type="game"
              prediction={currentPrediction}
              currentPrice={selectedAsset.price}
              existingPositionCloid={activePositionCloid}
              // ✅ NEW: Pass real trade data to GameTimer (leverage is essential for fallback P&L)
              actualEntryPrice={activeTradeData?.entryPrice}
              positionSize={activeTradeData?.positionSize}
              leverage={activeTradeData?.leverage ?? selectedAsset?.maxLeverage ?? 1}
              positionValue={400} // Could also be calculated from positionSize if needed
            />
          )}

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