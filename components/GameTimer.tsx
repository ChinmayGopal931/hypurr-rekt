// Updated GameTimer.tsx with typed hooks and proper error handling
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Progress } from './ui/progress'
import { Clock, Target, TrendingUp, TrendingDown, DollarSign, Loader2, Zap, Flame, Trophy, AlertCircle } from 'lucide-react'
import { Prediction } from '@/app/page'
import { useHyperliquid, useRealTimePnL, useAssetPnL } from '@/hooks/useHyperliquid'
import { Area, AreaChart, CartesianGrid, DefaultTooltipContent, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import type { RealTimePnLData } from '@/service/hyperliquidOrders'

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

interface PriceDataPoint {
  time: number
  price: number
  elapsed: number
  timestamp: string
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
  const [realTimePnL, setRealTimePnL] = useState<RealTimePnLState>({
    unrealizedPnl: 0,
    returnOnEquity: 0,
    positionValue: 0,
    isLoading: false,
    lastUpdate: null,
    error: null
  })

  // Price chart data
  const [priceHistory, setPriceHistory] = useState<PriceDataPoint[]>([])
  const [isWinning, setIsWinning] = useState<boolean | null>(null)
  const gameStartTime = useRef<number>(Date.now())
  const lastPriceRef = useRef<number | null>(null)
  const pnlPollingRef = useRef<(() => void) | null>(null)

  // Chart configuration for shadcn
  const chartConfig = {
    price: {
      label: "Price",
      color: isWinning === true ? "hsl(var(--chart-1))" :
        isWinning === false ? "hsl(var(--chart-5))" :
          "hsl(var(--chart-3))"
    },
    entryPrice: {
      label: "Entry Price",
      color: "hsl(var(--chart-4))"
    }
  } satisfies ChartConfig

  // Get Hyperliquid hooks with proper typing
  const {
    address,
    isWalletConnected,
    startPnLPolling
  } = useHyperliquid()

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

  // Initialize game start time when prediction starts
  useEffect(() => {
    if (type === 'game' && prediction) {
      gameStartTime.current = Date.now()
      setPriceHistory([])

      console.log(`🎮 Game started for ${prediction.asset.symbol} - Direction: ${prediction.direction} - Entry: ${prediction.entryPrice}`)

      // Add initial price point
      if (currentPrice) {
        const initialPoint: PriceDataPoint = {
          time: 0,
          price: currentPrice,
          elapsed: 0,
          timestamp: new Date().toLocaleTimeString()
        }
        setPriceHistory([initialPoint])
        lastPriceRef.current = currentPrice
        console.log(`📊 Initial chart point added: ${currentPrice}`)
      } else {
        console.warn('⚠️ No currentPrice available at game start')
      }
    }
  }, [type, prediction, currentPrice])

  // Force chart updates every second for 30-second games
  useEffect(() => {
    if (type !== 'game' || !prediction || !currentPrice) return

    const updateInterval = setInterval(() => {
      const now = Date.now()
      const elapsed = (now - gameStartTime.current) / 1000

      if (elapsed <= initialTime && elapsed > 0) {
        const newPoint: PriceDataPoint = {
          time: elapsed,
          price: currentPrice,
          elapsed: elapsed,
          timestamp: new Date().toLocaleTimeString()
        }

        setPriceHistory(prev => {
          // Always add new point every second, even if price hasn't changed
          const newHistory = [...prev, newPoint]

          // For 30-second games, keep more frequent updates
          const maxPoints = initialTime <= 60 ? initialTime * 2 : 100
          if (newHistory.length > maxPoints) {
            return newHistory.slice(-maxPoints)
          }
          return newHistory
        })

        // Update winning status
        const priceDiff = currentPrice - prediction.entryPrice
        const newIsWinning = prediction.direction === 'up' ? priceDiff > 0 : priceDiff < 0
        setIsWinning(newIsWinning)

        console.log(`Chart update: ${elapsed.toFixed(1)}s - Price: ${currentPrice} - ${newIsWinning ? 'WINNING' : 'LOSING'}`)
      }
    }, 500) // Update every 500ms for smooth movement

    return () => clearInterval(updateInterval)
  }, [type, prediction, currentPrice, initialTime])

  // Also update immediately when price changes
  useEffect(() => {
    if (type === 'game' && currentPrice && lastPriceRef.current !== currentPrice && prediction) {
      const now = Date.now()
      const elapsed = (now - gameStartTime.current) / 1000

      if (elapsed <= initialTime && elapsed > 0) {
        const newPoint: PriceDataPoint = {
          time: elapsed,
          price: currentPrice,
          elapsed: elapsed,
          timestamp: new Date().toLocaleTimeString()
        }

        setPriceHistory(prev => {
          // Check if we just added a point recently to avoid duplicates
          const lastPoint = prev[prev.length - 1]
          if (lastPoint && Math.abs(lastPoint.elapsed - elapsed) < 0.3) {
            // Update the last point instead of adding new one
            const updatedHistory = [...prev]
            updatedHistory[updatedHistory.length - 1] = newPoint
            return updatedHistory
          } else {
            return [...prev, newPoint]
          }
        })

        lastPriceRef.current = currentPrice
        console.log(`Price change detected: ${currentPrice} at ${elapsed.toFixed(1)}s`)
      }
    }
  }, [currentPrice, type, prediction, initialTime])

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
                error: null
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
        stopPolling()
        pnlPollingRef.current = null
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

  // Determine which P&L to show with proper typing
  const getPnLDisplay = useCallback((): PnLDisplayData | null => {
    if (realTimePnL.lastUpdate && !realTimePnL.error) {
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
        isLoading: false
      }
    }
  }, [realTimePnL, getFallbackPnL])

  const pnlDisplay = getPnLDisplay()

  // Get chart colors based on performance
  const getChartColors = useCallback(() => {
    if (isWinning === true) {
      return {
        stroke: 'hsl(var(--chart-1))', // Green
        fill: 'url(#greenGradient)',
        glow: 'shadow-green-500/50'
      }
    }
    if (isWinning === false) {
      return {
        stroke: 'hsl(var(--chart-5))', // Red  
        fill: 'url(#redGradient)',
        glow: 'shadow-red-500/50'
      }
    }
    return {
      stroke: 'hsl(var(--chart-3))', // Blue
      fill: 'url(#blueGradient)',
      glow: 'shadow-blue-500/50'
    }
  }, [isWinning])

  const chartColors = getChartColors()

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

      {/* Real-time Price Chart */}
      {prediction && priceHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`
            p-4 bg-slate-800/30 rounded-xl border-2 transition-all duration-300
            ${isWinning === true ? 'border-green-500/50 bg-green-500/5' :
              isWinning === false ? 'border-red-500/50 bg-red-500/5' :
                'border-slate-700'}
            ${chartColors.glow} shadow-lg
          `}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${isWinning === true ? 'bg-green-400' :
                isWinning === false ? 'bg-red-400' :
                  'bg-blue-400'
                }`} />
              <span className="text-sm font-medium text-slate-300">
                {prediction.asset.symbol} Live Price
              </span>
              <span className="text-xs text-slate-500">
                ({priceHistory.length} points)
              </span>
            </div>
            <div className="text-sm text-slate-400">
              Entry: ${prediction.entryPrice.toFixed(2)}
            </div>
          </div>

          {/* Chart Container */}
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <AreaChart data={priceHistory} accessibilityLayer>
              <defs>
                <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                strokeOpacity={0.3}
                vertical={false}
              />

              <XAxis
                dataKey="elapsed"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                tickFormatter={(value: number) => `${value.toFixed(0)}s`}
                tickMargin={10}
              />

              <YAxis
                domain={[(dataMin: number) => {
                  // Make Y-axis more sensitive for small price movements
                  const padding = Math.max((dataMin * 0.001), 0.1) // 0.1% padding or minimum $0.10
                  return dataMin - padding
                }, (dataMax: number) => {
                  const padding = Math.max((dataMax * 0.001), 0.1)
                  return dataMax + padding
                }]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                tickFormatter={(value: number) => `${value.toFixed(2)}`}
                width={80}
              />

              {/* Entry Price Reference Line */}
              <ReferenceLine
                y={prediction.entryPrice}
                stroke="hsl(var(--chart-4))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Entry $${prediction.entryPrice.toFixed(2)}`,
                  fill: "hsl(var(--chart-4))",
                  fontSize: 12
                }}
              />

              {/* Price Area */}
              <Area
                type="monotone"
                dataKey="price"
                stroke={chartColors.stroke}
                strokeWidth={3}
                fill={chartColors.fill}
                dot={{
                  r: 2,
                  fill: chartColors.stroke,
                  className: 'drop-shadow-lg'
                }}
                activeDot={{
                  r: 4,
                  fill: chartColors.stroke,
                  stroke: '#fff',
                  strokeWidth: 2,
                  className: 'drop-shadow-lg'
                }}
              />

              <ChartTooltip
                content={
                  <DefaultTooltipContent<number, string>
                    formatter={(value) => [value.toString(), "someLabel"]}
                  />
                }
              />
            </AreaChart>
          </ChartContainer>

          {/* Current Price Display with Debug Info */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-400">Current:</span>
              <span className="text-lg font-mono font-bold text-white">
                ${currentPrice?.toFixed(2)}
              </span>
              {/* Debug: Show if price is updating */}
              <span className="text-xs text-slate-500">
                (Last: {lastPriceRef.current?.toFixed(2) || 'none'})
              </span>
            </div>

            {pnlDisplay && (
              <div className={`
                flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-bold
                ${pnlDisplay.isWinning ? 'bg-green-500/20 text-green-400' :
                  pnlDisplay.isLosing ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-500/20 text-slate-400'}
              `}>
                {pnlDisplay.isWinning ? '📈' : pnlDisplay.isLosing ? '📉' : '➡️'}
                <span>
                  {pnlDisplay.isWinning ? '+' : pnlDisplay.isLosing ? '-' : ''}
                  {pnlDisplay.value.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

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

      {/* Enhanced P&L Display with Error Handling */}
      {pnlDisplay && (
        <motion.div
          key={`${pnlDisplay.isWinning}-${pnlDisplay.value}`}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
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
              {realTimePnL.lastUpdate && !realTimePnL.error && (
                <span className="ml-2 text-xs text-green-400">
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
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
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
              <span>BREAK EVEN</span>
            )}
          </motion.div>

          {/* Data source indicator and error messages */}
          <div className="mt-2 space-y-1">
            {!pnlDisplay.isReal && !realTimePnL.isLoading && (
              <div className="text-xs text-slate-500">
                Calculated from price movement
              </div>
            )}

            {realTimePnL.error && (
              <div className="text-xs text-red-400 flex items-center justify-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>P&L data error: {realTimePnL.error}</span>
              </div>
            )}

            {pnlQuery.error && (
              <div className="text-xs text-yellow-400">
                Warning: Real-time P&L unavailable
              </div>
            )}

            {assetPnLQuery.error && (
              <div className="text-xs text-yellow-400">
                Warning: Asset P&L unavailable
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Time warning */}
      <AnimatePresence>
        {isLastSeconds && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: [1, 1.05, 1],
              boxShadow: ['0 0 0 0 rgba(239, 68, 68, 0.7)', '0 0 0 20px rgba(239, 68, 68, 0)', '0 0 0 0 rgba(239, 68, 68, 0)']
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              scale: { duration: 0.6, repeat: Infinity },
              boxShadow: { duration: 1.5, repeat: Infinity }
            }}
            className="text-center text-red-400 font-bold text-lg bg-red-500/20 p-4 rounded-lg border border-red-500/50"
          >
            ⚠️ TIME RUNNING OUT! ⚠️
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}