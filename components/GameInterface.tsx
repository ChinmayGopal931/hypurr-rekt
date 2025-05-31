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
import { AlertTriangle, DollarSign, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { WalletConnection } from './WalletConnection'
import { AgentStatus } from './AgentStatus'

interface GameInterfaceProps {
  gameState: GameState
  setGameState: (state: GameState) => void
  currentPrediction: Prediction | null
  setCurrentPrediction: (prediction: Prediction | null) => void
  gameStats: GameStats
  setGameStats: (stats: GameStats) => void
  soundEnabled: boolean
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
  const [countdownTime, setCountdownTime] = useState<number>(0)
  const [walletReady, setWalletReady] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

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
    getCurrentPrice
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
    }
  }, [activePositions.length])

  // Handle real prediction order placement
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

          const orderRequest = {
            asset: selectedAsset.id,
            direction,
            price: currentPrice, // Use real-time price
            size: '10', // $10 fixed size
            timeWindow
          }

          console.log('Placing prediction order:', orderRequest)
          const response = await placePredictionOrder(orderRequest)
          
          if (response.success && response.fillInfo?.filled) {
            // Order filled successfully - create prediction tracking
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
            
            console.log('Order placed successfully:', {
              orderId: response.orderId,
              cloid: response.cloid,
              fillPrice: response.fillInfo.fillPrice
            })
            
            // Register for position outcome callback
            if (response.cloid) {
              onPositionResult(response.cloid, (result, exitPrice) => {
                handleGameComplete(result, exitPrice)
              })
            }
            
          } else {
            // Order failed or not filled
            const errorMessage = response.error || 'Order was not filled'
            setOrderError(errorMessage)
            setGameState('idle')
            console.error('Order placement failed:', errorMessage)
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
            {isWalletConnected && (
              <>
                <Badge variant="outline" className="text-blue-400 border-blue-400">
                  <DollarSign className="w-3 h-3 mr-1" />
                  $10 per trade
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
            <TimeWindowSelector
              timeWindow={timeWindow}
              onTimeWindowSelect={setTimeWindow}
              disabled={gameState !== 'idle' || !canPlaceOrder}
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
              <div className="text-sm text-slate-400">
                {isPlacingOrder ? 'Sending order to Hyperliquid...' : 'Get ready!'}
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
          <span>Real orders, no real money</span>
          <span>•</span>
          <span>$10 fixed prediction size</span>
        </div>
      </div>
    </div>
  )
}