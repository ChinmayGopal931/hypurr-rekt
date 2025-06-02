// src/components/GameInterface.tsx
import { useState, useEffect } from 'react'
import { Card } from './ui/card'
import { AssetSelector } from './AssetSelector'
import { PriceDisplay } from './PriceDisplay'
import { GameTimer } from './GameTimer'
import { Asset, GameState, Prediction, GameStats } from '@/app/page'
import { TimeWindowSelector } from './TimeWindow'
import { PredictionButtons } from './Prediction'
import { ResultDisplay } from './ResultsDisplay'
import { useHyperliquid } from '@/hooks/useHyperliquid'
import { AlertTriangle, DollarSign, Loader2, RefreshCw, Wifi, WifiOff, TrendingUp } from 'lucide-react'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { WalletConnection } from './WalletConnection'
import { AgentStatus } from './AgentStatus'
import { DepositRequiredAlert } from './DepositAlert'

interface GameInterfaceProps {
  gameState: GameState
  setGameState: (state: GameState) => void
  currentPrediction: Prediction | null
  setCurrentPrediction: (prediction: Prediction | null) => void
  gameStats: GameStats
  setGameStats: (stats: GameStats) => void
  soundEnabled: boolean
}

// Leverage Selector Component
const LeverageSelector = ({ 
  leverage, 
  onLeverageChange,
  disabled = false,
  selectedAsset
}: { 
  leverage: number
  onLeverageChange: (leverage: number) => void 
  disabled?: boolean
  selectedAsset?: Asset | null
}) => {
  const leverageOptions = [10, 20, 30, 40] // Removed 50x since BTC max is 40x
  const marginAmount = 10 // Fixed $10 margin
  
  return (
    <Card className="p-4 bg-slate-900/50 border-slate-800">
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">True Leverage</span>
          <Badge variant="outline" className="text-green-400 border-green-400 text-xs">
            $10 margin
          </Badge>
        </div>
        
        <div className="flex space-x-2">
          {leverageOptions.map(option => {
            const positionValue = marginAmount * option
            const isMaxForBTC = selectedAsset?.id === 'BTC' && option > 40
            const isMaxForETH = selectedAsset?.id === 'ETH' && option > 25
            const isDisabled = disabled || isMaxForBTC || isMaxForETH
            
            return (
              <button
                key={option}
                onClick={() => onLeverageChange(option)}
                disabled={isDisabled}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors relative group ${
                  leverage === option
                    ? 'bg-blue-500 text-white'
                    : isDisabled
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {option}x
                {/* Tooltip showing position value */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  ${positionValue} position
                  {isMaxForBTC && <div className="text-red-400">Max for BTC: 40x</div>}
                  {isMaxForETH && <div className="text-red-400">Max for ETH: 25x</div>}
                </div>
              </button>
            )
          })}
        </div>
        
        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Margin:</span>
            <span className="text-green-400">$10 USDC</span>
          </div>
          <div className="flex justify-between">
            <span>Position:</span>
            <span className="text-blue-400">${marginAmount * leverage} (~{leverage}x)</span>
          </div>
          <div className="text-orange-400 text-center font-medium">
            True leverage: Risk $10 to control ${marginAmount * leverage}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function GameInterface({
  gameState,
  setGameState,
  currentPrediction,
  setCurrentPrediction,
  gameStats,
  setGameStats,
  soundEnabled
}: GameInterfaceProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [timeWindow, setTimeWindow] = useState<number>(30)
  const [selectedLeverage, setSelectedLeverage] = useState<number>(40) // Default to 40x
  const [countdownTime, setCountdownTime] = useState<number>(0)
  const [walletReady, setWalletReady] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [needsDeposit, setNeedsDeposit] = useState(false)

  // Consolidated Hyperliquid hook with all functionality
  const { 
    // Price feed data
    assets, 
    isLoading, 
    error, 
    isConnected: hlConnected, 
    lastUpdate,
    
    // Wallet & orders
    isWalletConnected,
    address,
    placePredictionOrder,
    onPositionResult,
    getActivePositions,
    getCurrentPrice,
    calculatePositionSize
  } = useHyperliquid()

  // Get active positions
  const activePositions = getActivePositions()

  // Determine if user can place orders
  const canPlaceOrder = Boolean(
    isWalletConnected && 
    address &&
    !isPlacingOrder && 
    activePositions.length === 0 &&
    !orderError &&
    hlConnected
  )

  console.log(hlConnected, canPlaceOrder)

  // Set default selected asset when assets load
  useEffect(() => {
    if (assets.length > 0 && !selectedAsset) {
      const btcAsset = assets.find(asset => asset.id === 'BTC')
      setSelectedAsset(btcAsset || assets[0])
    }
  }, [assets, selectedAsset])

  // Update selected asset price in real-time
  useEffect(() => {
    if (selectedAsset && assets.length > 0) {
      const updatedAsset = assets.find(a => a.id === selectedAsset.id)
      if (updatedAsset) {
        setSelectedAsset(updatedAsset)
      }
    }
  }, [assets, selectedAsset?.id])

  // Clear order error when active positions change
  useEffect(() => {
    if (activePositions.length === 0) {
      setOrderError(null)
      setNeedsDeposit(false)
    }
  }, [activePositions.length])

  // Handle real prediction order placement with leverage
  const handlePrediction = async (direction: 'up' | 'down') => {
    if (!selectedAsset || !canPlaceOrder) return

    try {
      setIsPlacingOrder(true)
      setOrderError(null)
      setGameState('countdown')
      setCountdownTime(3)
      
      // Wait for countdown to complete before placing order
      setTimeout(async () => {
        try {
          const currentPrice = getCurrentPrice(selectedAsset.id)
          if (!currentPrice) {
            throw new Error(`No current price available for ${selectedAsset.id}`)
          }

          // ✅ Calculate position size based on leverage
          const positionCalc = await calculatePositionSize(selectedAsset.id, selectedLeverage)
          console.log('Position calculation:', positionCalc)

          const orderRequest = {
            asset: selectedAsset.id,
            direction,
            price: currentPrice,
            size: positionCalc?.assetSize || '10', // Fallback to '10' if calculation fails
            timeWindow,
            leverage: selectedLeverage // ✅ Include leverage in request
          }

          console.log('Placing prediction order with leverage:', {
            ...orderRequest,
            estimatedUsdValue: positionCalc?.usdValue || 'unknown'
          })
// Fix for the handlePrediction function in GameInterface.tsx
// Replace the order response handling section with this:

const response = await placePredictionOrder(orderRequest)

console.log('📦 Full order response:', JSON.stringify(response, null, 2))

if (response.success) {
  console.log('✅ Order succeeded, checking fill status...')
  console.log('📊 Fill info:', response.fillInfo)
  console.log('📊 Fill info filled?', response.fillInfo?.filled)
  console.log('📊 Fill price:', response.fillInfo?.fillPrice)
  
  if (response.fillInfo?.filled) {
    // ✅ Order filled immediately - start the game
    const prediction: Prediction = {
      id: response.cloid || Date.now().toString(),
      asset: selectedAsset,
      direction,
      entryPrice: response.fillInfo.fillPrice || currentPrice,
      timeWindow,
      timestamp: Date.now()
    }
    
    setCurrentPrediction(prediction)
    setGameState('active')
    setOrderError(null)
    
    console.log('✅ Order filled immediately with leverage:', {
      orderId: response.orderId,
      cloid: response.cloid,
      fillPrice: response.fillInfo.fillPrice,
      entryPrice: prediction.entryPrice, // This should match fillPrice
      leverage: `${selectedLeverage}x`,
      estimatedPositionValue: positionCalc?.usdValue,
      timeWindow: timeWindow
    })
    
    // Register for position outcome callback (auto-close)
    if (response.cloid) {
      onPositionResult(response.cloid, (result, exitPrice) => {
        console.log(`🎯 Position result: ${result.toUpperCase()} - Entry: $${prediction.entryPrice} → Exit: $${exitPrice}`)
        handleGameComplete(result, exitPrice)
      })
    }
    
  } else {
    console.log('⚠️ Order not filled immediately, checking if resting...')
    
    // ⚠️ Order placed but didn't fill immediately (resting)
    console.warn('⚠️ Order resting - monitoring for fill or auto-close')
    
    const prediction: Prediction = {
      id: response.cloid || Date.now().toString(),
      asset: selectedAsset,
      direction,
      entryPrice: currentPrice, // Use current price as estimated entry
      timeWindow,
      timestamp: Date.now()
    }
    
    setCurrentPrediction(prediction)
    setGameState('active') // Still start the game timer
    setOrderError(null)
    
    // Show warning that order is pending
    console.log('⚠️ Order resting - will be auto-closed when timer expires')
    
    // Register for position outcome callback
    if (response.cloid) {
      onPositionResult(response.cloid, (result, exitPrice) => {
        console.log(`🎯 Position result: ${result.toUpperCase()} - Entry: ~$${prediction.entryPrice} → Exit: $${exitPrice}`)
        handleGameComplete(result, exitPrice)
      })
    }
  }
} else {
  // ❌ Order failed completely
  console.error('❌ Order failed:', response)
  const errorMessage = response.error || 'Order failed'
  
  // Check for specific error types
  if (errorMessage === 'NEEDS_HYPERLIQUID_DEPOSIT') {
    setNeedsDeposit(true)
    setOrderError(null)
  } else if (errorMessage.includes('ACCOUNT_NOT_FOUND')) {
    setNeedsDeposit(true)
    setOrderError(null)
  } else {
    setOrderError(errorMessage)
  }
  
  setGameState('idle')
  console.error('❌ Order placement failed:', errorMessage)
}
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to place order'
          setOrderError(errorMessage)
          setGameState('idle')
          console.error('Order placement error:', error)
        } finally {
          setIsPlacingOrder(false)
        }
      }, 3000) // 3 second countdown
      
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to initiate order'
      setOrderError(errorMessage)
      setGameState('idle')
      setIsPlacingOrder(false)
      console.error('Prediction initiation failed:', error)
    }
  }

  const handleGameComplete = (result: 'win' | 'loss', exitPrice: number) => {
    if (!currentPrediction) return

    const updatedPrediction = {
      ...currentPrediction,
      result,
      exitPrice
    }

    setCurrentPrediction(updatedPrediction)
    setGameState('result')

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

    // Auto-reset after showing result
    setTimeout(() => {
      setGameState('idle')
      setCurrentPrediction(null)
    }, 4000) // Longer display time for real trades
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  // Clear error when user clicks anywhere
  const clearError = () => {
    if (gameState === 'idle') {
      setOrderError(null)
      setNeedsDeposit(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <div className="text-white text-lg font-semibold">Loading Hyperliquid Data</div>
            <div className="text-center text-slate-400 space-y-1">
              <div>Connecting to Hyperliquid Testnet</div>
              <div className="text-sm">Fetching real-time crypto prices...</div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            <div className="font-semibold mb-1">Connection Failed</div>
            <div className="text-sm">Failed to connect to Hyperliquid: {error}</div>
          </AlertDescription>
        </Alert>
        
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <div className="text-slate-400">
              Unable to load real-time market data.
            </div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // No assets loaded
  if (assets.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto" />
            <div className="text-white text-lg font-semibold">No Trading Assets Available</div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6" onClick={clearError}>
      {/* Wallet Connection */}
      <WalletConnection onWalletReady={() => setWalletReady(true)} />

      {/* Agent Status */}
      <AgentStatus userAddress={address} isConnected={isWalletConnected} />

      {/* Connection Status */}
      <Card className="p-4 bg-slate-900/50 border-slate-800">
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-3">
      {hlConnected ? (
        <>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <Wifi className="w-4 h-4 text-green-400" />
            <Badge variant="outline" className="text-green-400 border-green-400">
              Live Data
            </Badge>
          </div>
          <div className="text-sm text-slate-400">
            {assets.length} assets • Real-time prices
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <WifiOff className="w-4 h-4 text-red-400" />
            <Badge variant="outline" className="text-red-400 border-red-400">
              Disconnected
            </Badge>
          </div>
        </>
      )}
    </div>
    
    <div className="flex items-center space-x-4">
      {isWalletConnected && selectedAsset && (
        <>
          <Badge variant="outline" className="text-orange-400 border-orange-400">
            <DollarSign className="w-3 h-3 mr-1" />
            $10 margin
          </Badge>
          <Badge variant="outline" className="text-blue-400 border-blue-400">
            <TrendingUp className="w-3 h-3 mr-1" />
            {selectedLeverage}x = ${10 * selectedLeverage}
          </Badge>
          <Badge variant="outline" className="text-green-400 border-green-400">
            Wallet Connected
          </Badge>
        </>
      )}
      {lastUpdate && (
        <div className="text-xs text-slate-500">
          Last update: {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  </div>
</Card>


      {/* Order Error Display */}
      {orderError && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            <div className="font-semibold mb-1">Order Failed</div>
            <div className="text-sm">{orderError}</div>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2 text-red-400 border-red-400 hover:bg-red-400/10"
              onClick={() => setOrderError(null)}
            >
              Dismiss
            </Button>
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

      {/* Game Controls - Only show if wallet connected */}
      {isWalletConnected && (gameState === 'idle' || gameState === 'countdown') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-slate-900/50 border-slate-800">
            <AssetSelector
              assets={assets}
              selectedAsset={selectedAsset}
              onAssetSelect={setSelectedAsset}
              disabled={gameState !== 'idle' || !canPlaceOrder}
            />
          </Card>
          
          <Card className="p-6 bg-slate-900/50 border-slate-800">
            <TimeWindowSelector
              timeWindow={timeWindow}
              onTimeWindowSelect={setTimeWindow}
              disabled={gameState !== 'idle' || !canPlaceOrder}
            />
          </Card>

          {/* ✅ Leverage Selector */}
          <LeverageSelector
            leverage={selectedLeverage}
            onLeverageChange={setSelectedLeverage}
            disabled={gameState !== 'idle' || !canPlaceOrder}
            selectedAsset={selectedAsset}
          />
        </div>
      )}

      {/* Prediction Buttons or Game Status */}
      {isWalletConnected && (
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          {gameState === 'idle' && (
            <PredictionButtons
              onPredict={handlePrediction}
              disabled={!selectedAsset || !hlConnected || !canPlaceOrder || isPlacingOrder}
            />
          )}
          
          {gameState === 'countdown' && (
            <div className="text-center space-y-4">
              <div className="text-2xl font-bold text-white">
                Placing Order...
              </div>
              <GameTimer
                initialTime={countdownTime}
                onComplete={() => {}} // Handled in handlePrediction
                type="countdown"
              />
              <div className="text-sm text-slate-400 space-y-1">
                <div>{isPlacingOrder ? 'Sending order to Hyperliquid...' : 'Get ready!'}</div>
                <div className="flex items-center justify-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-400">{selectedLeverage}x leverage</span>
                  <span>•</span>
                  <span className="text-purple-400">${10 * (selectedLeverage / 20)} position</span>
                </div>
              </div>
            </div>
          )}
          
          {gameState === 'active' && currentPrediction && selectedAsset && (
            <GameTimer
              initialTime={timeWindow}
              onComplete={() => {}} // Handled by position callback
              type="game"
              prediction={currentPrediction}
              currentPrice={selectedAsset.price}
            />
          )}
          
          {gameState === 'result' && currentPrediction && (
            <ResultDisplay
              prediction={currentPrediction}
              onPlayAgain={() => {
                setGameState('idle')
                setCurrentPrediction(null)
              }}
            />
          )}
        </Card>
      )}

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
    </div>
  )
}