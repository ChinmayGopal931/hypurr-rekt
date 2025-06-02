// Updated GameTimer.tsx with real-time Hyperliquid P&L
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Progress } from './ui/progress'
import { Clock, Target, TrendingUp, TrendingDown, DollarSign, Loader2 } from 'lucide-react'
import { Prediction } from '@/app/page'
import { useHyperliquid } from '@/hooks/useHyperliquid'

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

export function GameTimer({ initialTime, onComplete, type, prediction, currentPrice }: GameTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime)
  const [isActive, setIsActive] = useState(true)
  const [realTimePnL, setRealTimePnL] = useState<RealTimePnLState>({
    unrealizedPnl: 0,
    returnOnEquity: 0,
    positionValue: 0,
    isLoading: false,
    lastUpdate: null,
    error: null
  })

  // Get Hyperliquid hooks
  const { 
    address, 
    isWalletConnected, 
    getAssetPnL, 
    startPnLPolling 
  } = useHyperliquid()

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

  // Real-time P&L polling
  useEffect(() => {
    if (type !== 'game' || !prediction || !address || !isWalletConnected) {
      return
    }

    setRealTimePnL(prev => ({ ...prev, isLoading: true, error: null }))

    // Start polling for P&L updates
    const stopPolling = startPnLPolling(
      address,
      async (pnlData) => {
        if (!pnlData) {
          setRealTimePnL(prev => ({
            ...prev,
            isLoading: false,
            error: 'Failed to fetch P&L data'
          }))
          return
        }

        try {
          
          // Get specific asset P&L
          const assetPnL = await getAssetPnL(address, prediction.asset.id)
          
          if (assetPnL) {
            setRealTimePnL({
              unrealizedPnl: assetPnL.unrealizedPnl,
              returnOnEquity: assetPnL.returnOnEquity,
              positionValue: assetPnL.positionValue,
              isLoading: false,
              lastUpdate: Date.now(),
              error: null
            })
          } else {
            // No position found - might be a very small position or already closed
            setRealTimePnL(prev => ({
              ...prev,
              unrealizedPnl: 0,
              returnOnEquity: 0,
              positionValue: 0,
              isLoading: false,
              lastUpdate: Date.now(),
              error: null
            }))
          }
        } catch (error) {
          console.error('Error processing P&L data:', error)
          setRealTimePnL(prev => ({
            ...prev,
            isLoading: false,
            error: 'Error processing P&L data'
          }))
        }
      },
      2000 // Poll every 2 seconds
    )

    // Cleanup polling on unmount
    return () => {
      stopPolling()
    }
  }, [type, prediction, address, isWalletConnected, startPnLPolling, getAssetPnL])

  const progressPercent = ((initialTime - timeLeft) / initialTime) * 100
  const isLastSeconds = timeLeft <= 3
  const isLastSecond = timeLeft <= 1

  // Fallback to price-based calculation if real P&L is not available
  const getFallbackPnL = useCallback(() => {
    if (!prediction || !currentPrice) return null
    
    const priceDiff = currentPrice - prediction.entryPrice
    const percentage = (priceDiff / prediction.entryPrice) * 100
    
    const isWinning = 
      (prediction.direction === 'up' && priceDiff > 0) ||
      (prediction.direction === 'down' && priceDiff < 0)
    
    return {
      value: Math.abs(percentage),
      isWinning,
      isLosing: !isWinning && priceDiff !== 0
    }
  }, [prediction, currentPrice])

  // Determine which P&L to show
  const getPnLDisplay = () => {
    if (realTimePnL.lastUpdate && !realTimePnL.error) {
      // Use real Hyperliquid P&L
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
      // Fallback to price-based calculation
      const fallback = getFallbackPnL()
      if (!fallback) return null
      
      return {
        value: fallback.value,
        dollarValue: null,
        isWinning: fallback.isWinning,
        isLosing: fallback.isLosing,
        isReal: false,
        isLoading: false
      }
    }
  }

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
            ${isLastSeconds ? 'bg-red-900' : 'bg-slate-700'}
          `}
        />
      </div>

      {/* Real-time P&L Display */}
      {pnlDisplay && (
        <motion.div
          key={`${pnlDisplay.isWinning}-${pnlDisplay.value}`}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          className="text-center p-4 bg-slate-800/30 rounded-lg border border-slate-700"
        >
          <div className="flex items-center justify-center space-x-2 mb-2">
            {pnlDisplay.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            ) : (
              <DollarSign className="w-4 h-4 text-yellow-400" />
            )}
            <div className="text-slate-400 text-sm">
              {pnlDisplay.isReal ? 'Live P&L' : 'Estimated P&L'}
              {realTimePnL.lastUpdate && (
                <span className="ml-2 text-xs text-green-400">
                  ● Live
                </span>
              )}
            </div>
          </div>
          
          {/* Percentage P&L */}
          <div className={`
            text-3xl font-bold font-mono mb-1
            ${pnlDisplay.isWinning ? 'text-green-400' : pnlDisplay.isLosing ? 'text-red-400' : 'text-white'}
          `}>
            {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}{pnlDisplay.value.toFixed(2)}%
          </div>

          {/* Dollar P&L (if available from real data) */}
          {pnlDisplay.dollarValue !== null && (
            <div className={`
              text-lg font-mono mb-2
              ${pnlDisplay.isWinning ? 'text-green-400' : pnlDisplay.isLosing ? 'text-red-400' : 'text-white'}
            `}>
              {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}${pnlDisplay.dollarValue.toFixed(2)}
            </div>
          )}
          
          <div className={`
            text-sm font-medium
            ${pnlDisplay.isWinning ? 'text-green-400' : pnlDisplay.isLosing ? 'text-red-400' : 'text-slate-400'}
          `}>
            {pnlDisplay.isWinning ? '🚀 WINNING!' : pnlDisplay.isLosing ? '💔 LOSING' : 'BREAK EVEN'}
          </div>

          {/* Data source indicator */}
          {!pnlDisplay.isReal && !realTimePnL.isLoading && (
            <div className="text-xs text-slate-500 mt-1">
              Calculated from price movement
            </div>
          )}
          
          {realTimePnL.error && (
            <div className="text-xs text-red-400 mt-1">
              P&L data unavailable
            </div>
          )}
        </motion.div>
      )}

      {/* Time warning */}
      {isLastSeconds && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-red-400 font-bold"
        >
          ⚠️ TIME RUNNING OUT!
        </motion.div>
      )}
    </div>
  )
}