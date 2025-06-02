// src/components/ResultDisplay.tsx
import { motion } from 'framer-motion'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Trophy, X, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react'
import { Prediction } from '@/app/page'

interface ResultDisplayProps {
  prediction: Prediction
  onPlayAgain: () => void
}

export function ResultDisplay({ prediction, onPlayAgain }: ResultDisplayProps) {
  const isWin = prediction.result === 'win'
  const priceDiff = prediction.exitPrice! - prediction.entryPrice
  const percentage = (priceDiff / prediction.entryPrice) * 100
  const absolutePercentage = Math.abs(percentage)

  const resultConfig = {
    win: {
      title: '🎉 YOU WON!',
      subtitle: 'Great prediction!',
      bgColor: 'bg-gradient-to-r from-green-500 to-emerald-600',
      textColor: 'text-green-400',
      borderColor: 'border-green-400',
      icon: <Trophy className="w-12 h-12 text-yellow-400" />
    },
    loss: {
      title: '💔 YOU LOST',
      subtitle: 'Better luck next time!',
      bgColor: 'bg-gradient-to-r from-red-500 to-rose-600',
      textColor: 'text-red-400',
      borderColor: 'border-red-400',
      icon: <X className="w-12 h-12 text-red-400" />
    }
  }

  const config = resultConfig[isWin ? 'win' : 'loss']

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, type: "spring" }}
      className="text-center space-y-6"
    >
      {/* Result Header */}
      <div className="space-y-4">
        <motion.div
          initial={{ y: -20 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {config.icon}
        </motion.div>

        <div>
          <h2 className="text-3xl font-bold text-white mb-2">{config.title}</h2>
          <p className="text-slate-400">{config.subtitle}</p>
        </div>
      </div>

      {/* Prediction Summary */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-6 bg-slate-800/30 rounded-lg space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-slate-400 text-sm">Your Prediction</div>
            <Badge
              variant="outline"
              className={`
                text-lg px-3 py-1 mt-1
                ${prediction.direction === 'up'
                  ? 'text-green-400 border-green-400'
                  : 'text-red-400 border-red-400'
                }
              `}
            >
              {prediction.direction === 'up' ? (
                <><TrendingUp className="w-4 h-4 mr-1" />UP</>
              ) : (
                <><TrendingDown className="w-4 h-4 mr-1" />DOWN</>
              )}
            </Badge>
          </div>

          <div>
            <div className="text-slate-400 text-sm">Asset</div>
            <div className="text-white font-bold">{prediction.asset.symbol}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-slate-400 text-sm">Entry Price</div>
            <div className="text-white font-mono">
              ${prediction.entryPrice.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-slate-400 text-sm">Exit Price</div>
            <div className="text-white font-mono">
              ${prediction.exitPrice!.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Price Movement */}
        <div className="border-t border-slate-700 pt-4">
          <div className="text-slate-400 text-sm mb-2">Price Movement</div>
          <div className="flex items-center justify-between">
            <div className={`text-2xl font-bold ${config.textColor}`}>
              {priceDiff >= 0 ? '+' : ''}{percentage.toFixed(2)}%
            </div>
            <div className={`text-lg font-mono ${config.textColor}`}>
              {priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Performance Indicator */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.4, type: "spring" }}
        className={`
          p-4 rounded-lg border-2 ${config.borderColor}
          ${isWin ? 'bg-green-500/10' : 'bg-red-500/10'}
        `}
      >
        <div className="text-white font-bold text-lg">
          {isWin ? '✅ CORRECT PREDICTION' : '❌ WRONG PREDICTION'}
        </div>
        <div className="text-slate-400 text-sm">
          Price moved {absolutePercentage.toFixed(2)}% {priceDiff >= 0 ? 'UP' : 'DOWN'}
        </div>
      </motion.div>

      {/* Play Again Button */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Button
          onClick={onPlayAgain}
          className={`
            w-full h-14 text-xl font-bold transition-all duration-300
            ${config.bgColor} hover:scale-105 border-0 text-white shadow-xl
          `}
        >
          <RotateCcw className="w-6 h-6 mr-2" />
          PLAY AGAIN
        </Button>
      </motion.div>
    </motion.div>
  )
}