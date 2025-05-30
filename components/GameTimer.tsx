// src/components/GameTimer.tsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Progress } from './ui/progress'
import { Clock, Target, TrendingUp, TrendingDown } from 'lucide-react'
import { Prediction } from '@/app/page'

interface GameTimerProps {
  initialTime: number
  onComplete: () => void
  type: 'countdown' | 'game'
  prediction?: Prediction
  currentPrice?: number
}

export function GameTimer({ initialTime, onComplete, type, prediction, currentPrice }: GameTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime)
  const [isActive, setIsActive] = useState(true)

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

  const progressPercent = ((initialTime - timeLeft) / initialTime) * 100
  const isLastSeconds = timeLeft <= 3
  const isLastSecond = timeLeft <= 1

  const getCurrentPnL = () => {
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
  }

  const pnl = getCurrentPnL()

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

      {/* Current P&L */}
      {pnl && (
        <motion.div
          key={`${pnl.isWinning}-${pnl.value}`}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          className="text-center p-4 bg-slate-800/30 rounded-lg"
        >
          <div className="text-slate-400 text-sm mb-1">Current P&L</div>
          <div className={`
            text-3xl font-bold font-mono
            ${pnl.isWinning ? 'text-green-400' : pnl.isLosing ? 'text-red-400' : 'text-white'}
          `}>
            {pnl.isWinning ? '+' : pnl.isLosing ? '-' : ''}{pnl.value.toFixed(2)}%
          </div>
          
          <div className={`
            text-sm font-medium
            ${pnl.isWinning ? 'text-green-400' : pnl.isLosing ? 'text-red-400' : 'text-slate-400'}
          `}>
            {pnl.isWinning ? '🚀 WINNING!' : pnl.isLosing ? '💔 LOSING' : 'BREAK EVEN'}
          </div>
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