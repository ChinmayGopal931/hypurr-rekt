// GameTimer.tsx - Fixed to use consistent P&L logic with completion modal
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import { Clock, Target, TrendingUp, TrendingDown, DollarSign, Loader2, Zap, Flame, Trophy, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useHyperliquid, useAssetPnL } from '@/hooks/useHyperliquid'
import { useHyperliquidOrders } from '@/hooks/useHyperliquidTrading'
import { OrderBook } from '@/components/OrderBook'
import type { RealTimePnLData } from '@/service/hyperliquidOrders'
import { useAccount } from 'wagmi'
import { Prediction } from '@/lib/types'

// ✅ UPDATED: Add real trade data to props
interface GameTimerProps {
  initialTime: number
  onComplete: (realExitPrice?: number) => void
  type: 'countdown' | 'game'
  prediction?: Prediction
  currentPrice?: number
  existingPositionCloid?: string | null
  // ✅ NEW: Real trade data for consistent P&L calculation
  actualEntryPrice?: number
  positionSize?: string
  leverage?: number
  positionValue?: number
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

export function GameTimer({
  initialTime,
  onComplete,
  type,
  prediction,
  currentPrice,
  existingPositionCloid = null,
  // ✅ NEW: Receive real trade data
  actualEntryPrice,
  positionSize,
  leverage,
  positionValue = 400
}: GameTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime)
  const [isActive, setIsActive] = useState(true)
  const [showOrderBook, setShowOrderBook] = useState(false)
  const [isClosingPosition, setIsClosingPosition] = useState(false)
  const [realTimePnL, setRealTimePnL] = useState<RealTimePnLState>({
    unrealizedPnl: 0,
    returnOnEquity: 0,
    positionValue: 0,
    isLoading: false,
    lastUpdate: null,
    error: null
  })
  const [isWinning, setIsWinning] = useState<boolean | null>(null)
  const pnlPollingRef = useRef<(() => void) | null>(null)

  const { address, isConnected: isWalletConnected, chain } = useAccount()
  const { startPnLPolling } = useHyperliquid(address)
  const { explicitClosePosition } = useHyperliquidOrders(address, isWalletConnected, chain)

  const activePositionCloid = existingPositionCloid
  const assetPnLQuery = useAssetPnL(address, prediction?.asset.id)

  const handlePnLError = useCallback((error: unknown): string => {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
    return 'Unknown P&L error occurred'
  }, [])

  // ✅ NEW: Calculate P&L using the same logic as completion modal
  const calculateRealTimePnL = useCallback((): {
    dollarPnL: number;
    percentagePnL: number;
    isRealData: boolean;
    actualResult: 'win' | 'loss' | 'neutral';
  } => {
    if (!prediction || typeof currentPrice === 'undefined') {
      return { dollarPnL: 0, percentagePnL: 0, isRealData: false, actualResult: 'neutral' };
    }

    // First priority: Use real-time P&L from API if available
    if (realTimePnL.lastUpdate && !realTimePnL.error && realTimePnL.unrealizedPnl !== 0) {
      const realPercentage = positionValue > 0 ? (Math.abs(realTimePnL.unrealizedPnl) / positionValue) * 100 : 0;
      return {
        dollarPnL: realTimePnL.unrealizedPnl,
        percentagePnL: realPercentage,
        isRealData: true,
        actualResult: realTimePnL.unrealizedPnl > 0 ? 'win' : realTimePnL.unrealizedPnl < 0 ? 'loss' : 'neutral'
      };
    }

    // Second priority: Calculate from actual prices and position size (same logic as completion modal)
    if (actualEntryPrice && positionSize) {
      const sizeNumber = parseFloat(positionSize);
      // ✅ FIXED: Account for trade direction in P&L calculation
      const dollarPnL = prediction.direction === 'up'
        ? (currentPrice - actualEntryPrice) * sizeNumber  // LONG position
        : (actualEntryPrice - currentPrice) * sizeNumber; // SHORT position
      const percentagePnL = positionValue > 0 ? (Math.abs(dollarPnL) / positionValue) * 100 : 0;

      return {
        dollarPnL,
        percentagePnL,
        isRealData: true,
        actualResult: dollarPnL > 0 ? 'win' : dollarPnL < 0 ? 'loss' : 'neutral'
      };
    }

    // Fallback: Use percentage estimation based on direction prediction (same as completion modal)
    const entryPrice = actualEntryPrice || prediction.entryPrice;
    const priceDiff = currentPrice - entryPrice;
    const percentageMove = entryPrice !== 0 ? Math.abs(priceDiff / entryPrice) * 100 : 0;

    const didPriceGoUp = priceDiff > 0;
    const predictedUp = prediction.direction === 'up';
    const isCorrectPrediction = didPriceGoUp === predictedUp;

    // ✅ FIXED: Apply leverage to the fallback calculation
    const usedLeverage = leverage || 1;
    const estimatedPnL = (positionValue * percentageMove * usedLeverage) / 100;
    const leveragedPnL = estimatedPnL * (isCorrectPrediction ? 1 : -1);

    return {
      dollarPnL: leveragedPnL,
      percentagePnL: percentageMove * usedLeverage, // ✅ FIXED: Apply leverage to percentage display
      isRealData: false,
      actualResult: isCorrectPrediction ? 'win' : 'loss'
    };
  }, [prediction, currentPrice, realTimePnL, actualEntryPrice, positionSize, positionValue]);

  // ✅ UPDATED: Get P&L display using consistent logic
  const getPnLDisplay = useCallback((): PnLDisplayData | null => {
    if (!activePositionCloid || !prediction) return null;

    const pnlCalc = calculateRealTimePnL();

    return {
      value: pnlCalc.percentagePnL,
      dollarValue: pnlCalc.isRealData ? pnlCalc.dollarPnL : null,
      isWinning: pnlCalc.actualResult === 'win',
      isLosing: pnlCalc.actualResult === 'loss',
      isReal: pnlCalc.isRealData,
      isLoading: realTimePnL.isLoading || assetPnLQuery.isLoading
    };
  }, [activePositionCloid, prediction, calculateRealTimePnL, realTimePnL.isLoading, assetPnLQuery.isLoading]);

  // Update winning state based on consistent P&L calculation
  useEffect(() => {
    if (type === 'game' && prediction && currentPrice) {
      const pnlCalc = calculateRealTimePnL();
      setIsWinning(pnlCalc.actualResult === 'win');
    }
  }, [type, prediction, currentPrice, calculateRealTimePnL]);

  const handleClosePosition = useCallback(async (cloidToClose: string): Promise<void> => {
    if (!cloidToClose || isClosingPosition) return

    console.log(`🎯 GameTimer: Timer expired, closing position ${cloidToClose}`)
    setIsClosingPosition(true)

    try {
      const closeResult = await explicitClosePosition({ cloid: cloidToClose })

      if (closeResult.success && closeResult.exitPrice) {
        console.log(`✅ GameTimer: Position ${cloidToClose} closed successfully at REAL PRICE ${closeResult.exitPrice}`)
        setIsClosingPosition(false)
        onComplete(closeResult.exitPrice)
        return
      } else {
        console.error(`❌ GameTimer: Failed to close position ${cloidToClose}:`, closeResult.error)
      }
    } catch (error) {
      console.error(`❌ GameTimer: Error closing position ${cloidToClose}:`, error)
    }

    console.log(`⚠️ GameTimer: Using fallback price ${currentPrice} due to close failure`)
    setIsClosingPosition(false)
    onComplete(currentPrice)
  }, [explicitClosePosition, isClosingPosition, onComplete, currentPrice]);

  // Timer countdown logic
  useEffect(() => {
    if (!isActive || timeLeft <= 0) return

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 0.1
        if (newTime <= 0) {
          setIsActive(false)

          if (type === 'game' && activePositionCloid) {
            console.log(`⏰ GameTimer: Timer expired, initiating position close for ${activePositionCloid}`)
            handleClosePosition(activePositionCloid)
          } else {
            onComplete()
          }

          return 0
        }
        return newTime
      })
    }, 100)

    return () => clearInterval(interval)
  }, [isActive, timeLeft, type, activePositionCloid, handleClosePosition, onComplete])

  // P&L polling effect (unchanged)
  useEffect(() => {
    if (type !== 'game' || !prediction || !address || !isWalletConnected || !activePositionCloid) {
      if (pnlPollingRef.current) {
        pnlPollingRef.current()
        pnlPollingRef.current = null
        setRealTimePnL(prev => ({ ...prev, isLoading: false, unrealizedPnl: 0, returnOnEquity: 0, positionValue: 0 }))
      }
      return
    }

    if (!pnlPollingRef.current && activePositionCloid) {
      setRealTimePnL(prev => ({ ...prev, isLoading: true, error: null }))
      try {
        const stopPolling = startPnLPolling(
          address,
          (pnlData: RealTimePnLData | null) => {
            if (!activePositionCloid) {
              if (pnlPollingRef.current) pnlPollingRef.current()
              pnlPollingRef.current = null
              setRealTimePnL(prev => ({ ...prev, isLoading: false, unrealizedPnl: 0, returnOnEquity: 0, positionValue: 0 }))
              return
            }
            if (!pnlData) {
              setRealTimePnL(prev => ({ ...prev, isLoading: false, error: 'Failed to fetch P&L data' }))
              return
            }
            try {
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
                const positionPnl = pnlData.positions.find(p => p.asset === prediction?.asset.id)
                if (positionPnl) {
                  setRealTimePnL({
                    unrealizedPnl: parseFloat(positionPnl.unrealizedPnl),
                    returnOnEquity: parseFloat(positionPnl.returnOnEquity),
                    positionValue: parseFloat(positionPnl.positionValue),
                    isLoading: false,
                    lastUpdate: Date.now(),
                    error: null
                  })
                } else {
                  setRealTimePnL(prev => ({ ...prev, isLoading: false, lastUpdate: Date.now(), error: null, unrealizedPnl: 0, returnOnEquity: 0, positionValue: 0 }))
                }
              }
            } catch (error: unknown) {
              setRealTimePnL(prev => ({ ...prev, isLoading: false, error: handlePnLError(error) }))
            }
          },
          2000
        )
        pnlPollingRef.current = stopPolling
      } catch (error: unknown) {
        setRealTimePnL(prev => ({ ...prev, isLoading: false, error: handlePnLError(error) }))
      }
    }

    return () => {
      if (pnlPollingRef.current) {
        pnlPollingRef.current()
        pnlPollingRef.current = null
      }
    }
  }, [type, prediction, address, isWalletConnected, startPnLPolling, assetPnLQuery.data, handlePnLError, activePositionCloid])

  const progressPercent = ((initialTime - timeLeft) / initialTime) * 100
  const isLastSeconds = timeLeft <= 3 && timeLeft > 0
  const isLastSecond = timeLeft <= 1 && timeLeft > 0

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
          className={`text-8xl font-bold text-blue-400 mb-4 ${isLastSecond ? 'text-red-400' : ''}`}
        >
          {Math.ceil(timeLeft)}
        </motion.div>
        <div className="text-slate-400">Your prediction will be placed in...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Target className="w-6 h-6 text-yellow-400" />
          <h3 className="text-xl font-bold text-white">
            {activePositionCloid ? "Game Active" : "Game Pending"}
          </h3>
          {activePositionCloid && isWinning === true && <Flame className="w-5 h-5 text-orange-400 animate-pulse" />}
          {activePositionCloid && isWinning === false && <Zap className="w-5 h-5 text-purple-400 animate-bounce" />}
        </div>
        {prediction && (
          <div className="flex items-center justify-center space-x-2">
            <span className="text-slate-400">Prediction:</span>
            <div className={`flex items-center space-x-1 font-bold ${prediction.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {prediction.direction === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{prediction.direction.toUpperCase()}</span>
            </div>
          </div>
        )}

      </div>

      {prediction && activePositionCloid && (
        <div className="text-center my-3">
          <Button variant="link" onClick={() => setShowOrderBook(prev => !prev)} className="text-blue-400 hover:text-blue-300 px-2 py-1 text-sm">
            {showOrderBook ? <><EyeOff className="inline-block w-4 h-4 mr-1 align-middle" />Hide OrderBook</> : <><Eye className="inline-block w-4 h-4 mr-1 align-middle" />View OrderBook</>}
          </Button>
        </div>
      )}

      <AnimatePresence>
        {prediction && showOrderBook && activePositionCloid && (
          <motion.div
            key="orderbook-motion"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: '1rem' }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <OrderBook coin={prediction.asset.id} currentPrice={currentPrice} isWinning={isWinning} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center">
        <motion.div
          animate={isLastSeconds ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5, repeat: isLastSeconds ? Infinity : 0 }}
          className={`text-6xl font-mono font-bold mb-2 ${isLastSeconds ? 'text-red-400' : 'text-white'}`}
        >
          {timeLeft.toFixed(1)}s
        </motion.div>
        <Progress
          value={progressPercent}
          className={`h-3 mb-4 ${isLastSeconds ? 'bg-red-900 progress-bar-red' : 'bg-slate-700 progress-bar-blue'}`}
          indicatorClassName={isLastSeconds ? 'bg-red-500' : 'bg-blue-500'}
        />
      </div>

      {isClosingPosition && (
        <div className="text-center text-yellow-400">
          <Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />
          Closing position at market price...
        </div>
      )}

      {/* ✅ UPDATED: P&L display now uses consistent calculation */}
      {pnlDisplay && activePositionCloid && (
        <motion.div
          key={`${pnlDisplay.isWinning}-${pnlDisplay.value.toFixed(2)}-${pnlDisplay.isReal}-${activePositionCloid}`}
          initial={{ opacity: 0.8, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`text-center p-6 rounded-xl border-2 transition-all duration-300 ${pnlDisplay.isWinning ? 'border-green-500/50 bg-green-500/10' :
            pnlDisplay.isLosing ? 'border-red-500/50 bg-red-500/10' :
              'border-slate-700 bg-slate-800/30'
            }`}
        >
          <div className="flex items-center justify-center space-x-2 mb-2">
            {pnlDisplay.isLoading ?
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> :
              realTimePnL.error ?
                <AlertCircle className="w-4 h-4 text-yellow-400" /> :
                <DollarSign className="w-4 h-4 text-yellow-400" />
            }
            <div className="text-slate-400 text-sm">
              {pnlDisplay.isReal ? 'Live P&L' : 'Estimated P&L'}
              {pnlDisplay.isReal && realTimePnL.lastUpdate && !realTimePnL.error &&
                <span className="ml-1 text-xs text-green-400/80">● Live</span>
              }
            </div>
          </div>
          <div className={`text-4xl font-bold font-mono mb-2 ${pnlDisplay.isWinning ? 'text-green-400' :
            pnlDisplay.isLosing ? 'text-red-400' :
              'text-white'
            }`}>
            {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}{pnlDisplay.value.toFixed(2)}%
          </div>
          {pnlDisplay.dollarValue !== null && (
            <div className={`text-xl font-mono mb-3 ${pnlDisplay.isWinning ? 'text-green-400' :
              pnlDisplay.isLosing ? 'text-red-400' :
                'text-white'
              }`}>
              {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}${Math.abs(pnlDisplay.dollarValue).toFixed(2)}
            </div>
          )}
          <motion.div
            animate={{ scale: pnlDisplay.isWinning || pnlDisplay.isLosing ? [1, 1.05, 1] : 1 }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            className={`text-lg font-medium flex items-center justify-center space-x-2 ${pnlDisplay.isWinning ? 'text-green-400' :
              pnlDisplay.isLosing ? 'text-red-400' :
                'text-slate-400'
              }`}
          >
            {pnlDisplay.isWinning ?
              <><Trophy className="w-5 h-5" /><span> WINNING!</span></> :
              pnlDisplay.isLosing ?
                <><Zap className="w-5 h-5" /><span> LOSING</span></> :
                <span>NEUTRAL</span>
            }
          </motion.div>
          <div className="mt-2 space-y-1 text-xs">
            {!pnlDisplay.isReal && !realTimePnL.isLoading && !realTimePnL.error &&
              <div className="text-slate-500">Based on {actualEntryPrice ? 'real trade data' : 'current price vs entry'}</div>
            }
            {realTimePnL.error &&
              <div className="text-red-400 flex items-center justify-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>P&L data error: {realTimePnL.error}</span>
              </div>
            }
          </div>
        </motion.div>
      )}
    </div>
  )
}