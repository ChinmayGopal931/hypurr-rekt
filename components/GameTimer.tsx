// Updated GameTimer.tsx with OrderBook component
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Progress } from './ui/progress'
import { Button } from './ui/button' // Added Button import
import { Clock, Target, TrendingUp, TrendingDown, DollarSign, Loader2, Zap, Flame, Trophy, AlertCircle, Eye, EyeOff } from 'lucide-react' // Added Eye and EyeOff icons
import { Prediction } from '@/app/page'
import { useHyperliquid, useRealTimePnL, useAssetPnL } from '@/hooks/useHyperliquid'
import { OrderBook } from '@/components/OrderBook'
import type { RealTimePnLData } from '@/service/hyperliquidOrders'
import { useAccount } from 'wagmi'

interface GameTimerProps {
  initialTime: number
  onComplete: () => void
  type: 'countdown' | 'game'
  prediction?: Prediction
  currentPrice?: number
}

interface RealTimePnLState {
  unrealizedPnl: number
  returnOnEquity: number
  positionValue: number
  isLoading: boolean
  lastUpdate: number | null
  error: string | null
}

interface PnLDisplayData {
  value: number
  dollarValue: number | null
  isWinning: boolean
  isLosing: boolean
  isReal: boolean
  isLoading: boolean
}

interface FallbackPnLData {
  value: number
  isWinning: boolean
  isLosing: boolean
}

export function GameTimer({ initialTime, onComplete, type, prediction, currentPrice }: GameTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime)
  const [isActive, setIsActive] = useState(true)
  const [showOrderBook, setShowOrderBook] = useState(false) // State for OrderBook visibility
  const [realTimePnL, setRealTimePnL] = useState<RealTimePnLState>({
    unrealizedPnl: 0,
    returnOnEquity: 0,
    positionValue: 0,
    isLoading: false,
    lastUpdate: null,
    error: null
  })

  // Winning status based on price movement
  const [isWinning, setIsWinning] = useState<boolean | null>(null)
  const pnlPollingRef = useRef<(() => void) | null>(null)

  const { address, isConnected: isWalletConnected } = useAccount()

  // Get Hyperliquid hooks with proper typing
  const {
    startPnLPolling
  } = useHyperliquid(address)


  // Use separate hooks for better performance and error isolation
  const pnlQuery = useRealTimePnL(address)
  const assetPnLQuery = useAssetPnL(address, prediction?.asset.id)

  // Error handling utility
  const handlePnLError = useCallback((error: unknown): string => {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message)
    }
    return 'Unknown P&L error occurred'
  }, [])

  // Calculate winning status based on price movement
  useEffect(() => {
    if (type === 'game' && prediction && currentPrice) {
      const priceDiff = currentPrice - prediction.entryPrice
      const newIsWinning = prediction.direction === 'up' ? priceDiff > 0 : priceDiff < 0
      setIsWinning(newIsWinning)
    }
  }, [type, prediction, currentPrice])

  // Timer logic
  useEffect(() => {
    if (!isActive || timeLeft <= 0) {
      if (timeLeft <= 0) onComplete()
      return
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 0.1
        if (newTime <= 0) {
          setIsActive(false)
          return 0
        }
        return newTime
      })
    }, 100)

    return () => clearInterval(interval)
  }, [isActive, timeLeft, onComplete])

  // Real-time P&L polling with proper error handling
  useEffect(() => {
    if (type !== 'game' || !prediction || !address || !isWalletConnected) {
      return
    }

    setRealTimePnL(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const stopPolling = startPnLPolling(
        address,
        (pnlData: RealTimePnLData | null) => {
          if (!pnlData) {
            setRealTimePnL(prev => ({
              ...prev,
              isLoading: false,
              error: 'Failed to fetch P&L data'
            }))
            return
          }

          try {
            // Use the asset PnL query data if available
            const assetPnLData = assetPnLQuery.data

            if (assetPnLData) {
              setRealTimePnL({
                unrealizedPnl: assetPnLData.unrealizedPnl,
                returnOnEquity: assetPnLData.returnOnEquity,
                positionValue: assetPnLData.positionValue,
                isLoading: false,
                lastUpdate: Date.now(),
                error: null
              })
            } else {
              setRealTimePnL(prev => ({
                ...prev,
                unrealizedPnl: 0,
                returnOnEquity: 0,
                positionValue: 0,
                isLoading: false,
                lastUpdate: Date.now(),
                error: null // Or consider a specific error if assetPnLQuery.isError is true
              }))
            }
          } catch (error: unknown) {
            const errorMessage = handlePnLError(error)
            console.error('Error processing P&L data:', errorMessage)
            setRealTimePnL(prev => ({
              ...prev,
              isLoading: false,
              error: errorMessage
            }))
          }
        },
        2000
      )

      pnlPollingRef.current = stopPolling

      return () => {
        if (pnlPollingRef.current) {
          pnlPollingRef.current()
          pnlPollingRef.current = null
        }
      }
    } catch (error: unknown) {
      const errorMessage = handlePnLError(error)
      console.error('Error starting P&L polling:', errorMessage)
      setRealTimePnL(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))
    }
  }, [type, prediction, address, isWalletConnected, startPnLPolling, assetPnLQuery.data, handlePnLError])


  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pnlPollingRef.current) {
        pnlPollingRef.current()
        pnlPollingRef.current = null
      }
    }
  }, [])

  const progressPercent = ((initialTime - timeLeft) / initialTime) * 100
  const isLastSeconds = timeLeft <= 3
  const isLastSecond = timeLeft <= 1

  // Fallback to price-based calculation if real P&L is not available
  const getFallbackPnL = useCallback((): FallbackPnLData | null => {
    if (!prediction || typeof currentPrice === 'undefined') return null

    const priceDiff = currentPrice - prediction.entryPrice
    // Avoid division by zero if entryPrice is 0 (though unlikely for crypto assets)
    const percentage = prediction.entryPrice !== 0 ? (priceDiff / prediction.entryPrice) * 100 : 0;


    const isWinning =
      (prediction.direction === 'up' && priceDiff > 0) ||
      (prediction.direction === 'down' && priceDiff < 0)

    return {
      value: Math.abs(percentage),
      isWinning,
      isLosing: !isWinning && priceDiff !== 0
    }
  }, [prediction, currentPrice])

  // Determine which P&L to show with proper typing
  const getPnLDisplay = useCallback((): PnLDisplayData | null => {
    if (realTimePnL.lastUpdate && !realTimePnL.error && assetPnLQuery.isSuccess) { // Ensure assetPnLQuery was successful
      const isWinning = realTimePnL.unrealizedPnl > 0
      const isLosing = realTimePnL.unrealizedPnl < 0

      return {
        value: Math.abs(realTimePnL.returnOnEquity),
        dollarValue: Math.abs(realTimePnL.unrealizedPnl),
        isWinning,
        isLosing,
        isReal: true,
        isLoading: realTimePnL.isLoading
      }
    } else {
      const fallback = getFallbackPnL()
      if (!fallback) return null

      return {
        value: fallback.value,
        dollarValue: null,
        isWinning: fallback.isWinning,
        isLosing: fallback.isLosing,
        isReal: false,
        isLoading: realTimePnL.isLoading // Reflect loading state even for fallback if PnL is being fetched
      }
    }
  }, [realTimePnL, getFallbackPnL, assetPnLQuery.isSuccess])

  const pnlDisplay = getPnLDisplay()

  if (type === 'countdown') {
    return (
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Clock className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-bold text-white">Get Ready!</h3>
        </div>

        <motion.div
          key={Math.ceil(timeLeft)}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          className={`
            text-8xl font-bold text-blue-400 mb-4
            ${isLastSecond ? 'text-red-400' : ''}
          `}
        >
          {Math.ceil(timeLeft)}
        </motion.div>

        <div className="text-slate-400">
          Your prediction will be placed in...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Target className="w-6 h-6 text-yellow-400" />
          <h3 className="text-xl font-bold text-white">Game Active</h3>
          {isWinning === true && <Flame className="w-5 h-5 text-orange-400 animate-pulse" />}
          {isWinning === false && <Zap className="w-5 h-5 text-purple-400 animate-bounce" />}
        </div>

        {prediction && (
          <div className="flex items-center justify-center space-x-2">
            <span className="text-slate-400">Prediction:</span>
            <div className={`
              flex items-center space-x-1 font-bold
              ${prediction.direction === 'up' ? 'text-green-400' : 'text-red-400'}
            `}>
              {prediction.direction === 'up' ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{prediction.direction.toUpperCase()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Button to toggle Order Book */}
      {prediction && (
        <div className="text-center my-3">
          <Button
            variant="link"
            onClick={() => setShowOrderBook(prev => !prev)}
            className="text-blue-400 hover:text-blue-300 px-2 py-1 text-sm"
          >
            {showOrderBook ? (
              <>
                <EyeOff className="inline-block w-4 h-4 mr-1 align-middle" />
                Hide Market Depth
              </>
            ) : (
              <>
                <Eye className="inline-block w-4 h-4 mr-1 align-middle" />
                View Market Depth
              </>
            )}
          </Button>
        </div>
      )}

      {/* Conditionally Rendered Real-time Order Book with Animation */}
      <AnimatePresence>
        {prediction && showOrderBook && (
          <motion.div
            key="orderbook-motion"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: '1rem' }} // Use 1rem for consistency with space-y-6 if it implies 1.5rem, or adjust as needed.
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden" // Crucial for height animation
          >
            <OrderBook
              coin={prediction.asset.id}
              currentPrice={currentPrice}
              isWinning={isWinning}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timer Display */}
      <div className="text-center">
        <motion.div
          animate={isLastSeconds ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5, repeat: isLastSeconds ? Infinity : 0 }}
          className={`
            text-6xl font-mono font-bold mb-2
            ${isLastSeconds ? 'text-red-400' : 'text-white'}
          `}
        >
          {timeLeft.toFixed(1)}s
        </motion.div>

        <Progress
          value={progressPercent}
          className={`
            h-3 mb-4
            ${isLastSeconds ? 'bg-red-900 progress-bar-red' : 'bg-slate-700 progress-bar-blue'} 
          `}
          indicatorClassName={isLastSeconds ? 'bg-red-500' : 'bg-blue-500'} // Assuming Progress component can take indicatorClassName
        />
      </div>

      {/* Enhanced P&L Display with Error Handling */}
      {pnlDisplay && (
        <motion.div
          key={`${pnlDisplay.isWinning}-${pnlDisplay.value.toFixed(2)}-${pnlDisplay.isReal}`} // More robust key
          initial={{ opacity: 0.8, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`
            text-center p-6 rounded-xl border-2 transition-all duration-300
            ${pnlDisplay.isWinning ? 'border-green-500/50 bg-green-500/10' :
              pnlDisplay.isLosing ? 'border-red-500/50 bg-red-500/10' :
                'border-slate-700 bg-slate-800/30'}
          `}
        >
          <div className="flex items-center justify-center space-x-2 mb-2">
            {pnlDisplay.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            ) : realTimePnL.error ? (
              <AlertCircle className="w-4 h-4 text-yellow-400" />
            ) : (
              <DollarSign className="w-4 h-4 text-yellow-400" />
            )}
            <div className="text-slate-400 text-sm">
              {pnlDisplay.isReal ? 'Live P&L' : 'Estimated P&L'}
              {pnlDisplay.isReal && realTimePnL.lastUpdate && !realTimePnL.error && (
                <span className="ml-1 text-xs text-green-400/80">
                  ● Live
                </span>
              )}
            </div>
          </div>

          {/* Percentage P&L */}
          <div className={`
            text-4xl font-bold font-mono mb-2
            ${pnlDisplay.isWinning ? 'text-green-400' : pnlDisplay.isLosing ? 'text-red-400' : 'text-white'}
          `}>
            {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}{pnlDisplay.value.toFixed(2)}%
          </div>

          {/* Dollar P&L */}
          {pnlDisplay.dollarValue !== null && (
            <div className={`
              text-xl font-mono mb-3
              ${pnlDisplay.isWinning ? 'text-green-400' : pnlDisplay.isLosing ? 'text-red-400' : 'text-white'}
            `}>
              {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}${pnlDisplay.dollarValue.toFixed(2)}
            </div>
          )}

          {/* Status with animated emoji */}
          <motion.div
            animate={{ scale: pnlDisplay.isWinning || pnlDisplay.isLosing ? [1, 1.05, 1] : 1 }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            className={`
              text-lg font-medium flex items-center justify-center space-x-2
              ${pnlDisplay.isWinning ? 'text-green-400' : pnlDisplay.isLosing ? 'text-red-400' : 'text-slate-400'}
            `}
          >
            {pnlDisplay.isWinning ? (
              <>
                <Trophy className="w-5 h-5" />
                <span>🚀 WINNING!</span>
              </>
            ) : pnlDisplay.isLosing ? (
              <>
                <Zap className="w-5 h-5" />
                <span>💔 LOSING</span>
              </>
            ) : (
              <span>NEUTRAL</span>
            )}
          </motion.div>

          {/* Data source indicator and error messages */}
          <div className="mt-2 space-y-1 text-xs">
            {!pnlDisplay.isReal && !realTimePnL.isLoading && !realTimePnL.error && (
              <div className="text-slate-500">
                Based on current price vs entry
              </div>
            )}

            {realTimePnL.error && (
              <div className="text-red-400 flex items-center justify-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>P&L data error: {realTimePnL.error}</span>
              </div>
            )}

            {/* Display hook-level errors if they are distinct or provide more info */}
            {pnlQuery.error && (!realTimePnL.error || pnlQuery.error.message !== realTimePnL.error) && (
              <div className="text-yellow-500/80">
                Warning: Real-time P&L unavailable ({pnlQuery.error.message})
              </div>
            )}

            {assetPnLQuery.error && (!realTimePnL.error || assetPnLQuery.error.message !== realTimePnL.error) && (
              <div className="text-yellow-500/80">
                Warning: Asset P&L unavailable ({assetPnLQuery.error.message})
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}