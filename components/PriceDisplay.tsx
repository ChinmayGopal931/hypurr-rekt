// src/components/PriceDisplay.tsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Asset, GameState, Prediction } from '@/lib/types'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Badge } from './ui/badge'

interface PriceDisplayProps {
  asset: Asset
  gameState: GameState
  prediction?: Prediction | null
}

export function PriceDisplay({ asset, gameState, prediction }: PriceDisplayProps) {
  const [prevPrice, setPrevPrice] = useState(asset.price)
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral')

  useEffect(() => {
    if (asset.price > prevPrice) {
      setPriceDirection('up')
    } else if (asset.price < prevPrice) {
      setPriceDirection('down')
    } else {
      setPriceDirection('neutral')
    }
    setPrevPrice(asset.price)
  }, [asset.price, prevPrice])

  const getPriceColor = () => {
    switch (priceDirection) {
      case 'up': return 'text-green-400'
      case 'down': return 'text-red-400'
      default: return 'text-white'
    }
  }

  const getBackgroundGlow = () => {
    switch (priceDirection) {
      case 'up': return 'shadow-green-500/20'
      case 'down': return 'shadow-red-500/20'
      default: return 'shadow-blue-500/10'
    }
  }

  const getPnL = () => {
    if (!prediction) return null

    const priceDiff = asset.price - prediction.entryPrice
    const percentage = (priceDiff / prediction.entryPrice) * 100

    // Determine if user is winning based on their prediction
    const isWinning =
      (prediction.direction === 'up' && priceDiff > 0) ||
      (prediction.direction === 'down' && priceDiff < 0)

    return {
      value: Math.abs(percentage),
      isWinning,
      isLosing: !isWinning && priceDiff !== 0
    }
  }

  const pnl = getPnL()

  // Format price based on value (more decimals for smaller prices)
  const formatPrice = (price: number): string => {
    if (price >= 1000) {
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    } else if (price >= 1) {
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      })
    } else {
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
      })
    }
  }

  return (
    <div className={`relative p-8 rounded-lg transition-all duration-300 ${getBackgroundGlow()}`}>
      {/* Asset Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">{asset.id}</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{asset.symbol}</h2>
            <p className="text-slate-400">{asset.name}</p>
          </div>
        </div>

        {prediction && gameState === 'active' && (
          <Badge
            variant="outline"
            className={`
              text-lg px-3 py-1
              ${prediction.direction === 'up'
                ? 'text-green-400 border-green-400'
                : 'text-red-400 border-red-400'
              }
            `}
          >
            {prediction.direction === 'up' ? (
              <><TrendingUp className="w-4 h-4 mr-1" />LONG</>
            ) : (
              <><TrendingDown className="w-4 h-4 mr-1" />SHORT</>
            )}
          </Badge>
        )}
      </div>

      {/* Current Price */}
      <div className="text-center mb-6">
        <motion.div
          key={asset.price}
          initial={{ scale: 1.1, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={`text-6xl font-mono font-bold ${getPriceColor()} mb-2`}
        >
          ${formatPrice(asset.price)}
        </motion.div>

        <div className="flex items-center justify-center space-x-2">
          {priceDirection === 'up' && <TrendingUp className="w-5 h-5 text-green-400" />}
          {priceDirection === 'down' && <TrendingDown className="w-5 h-5 text-red-400" />}
          <span className={`text-lg ${getPriceColor()}`}>
            {priceDirection === 'up' ? '+' : priceDirection === 'down' ? '-' : ''}
            {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Prediction Info */}
      {prediction && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-800/30 rounded-lg">
          <div className="text-center">
            <div className="text-slate-400 text-sm">Entry Price</div>
            <div className="text-white font-mono font-bold">
              ${formatPrice(prediction.entryPrice)}
            </div>
          </div>

          <div className="text-center">
            <div className="text-slate-400 text-sm">Current P&L</div>
            {pnl && (
              <motion.div
                key={`${pnl.isWinning}-${pnl.value}`}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className={`font-mono font-bold ${pnl.isWinning ? 'text-green-400' : pnl.isLosing ? 'text-red-400' : 'text-white'
                  }`}
              >
                {pnl.isWinning ? '+' : pnl.isLosing ? '-' : ''}{pnl.value.toFixed(2)}%
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Price Direction Indicator */}
      <AnimatePresence>
        {priceDirection !== 'neutral' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className={`
              absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center
              ${priceDirection === 'up' ? 'bg-green-500' : 'bg-red-500'}
            `}
          >
            {priceDirection === 'up' ? (
              <TrendingUp className="w-4 h-4 text-white" />
            ) : (
              <TrendingDown className="w-4 h-4 text-white" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}