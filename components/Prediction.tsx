// src/components/PredictionButtons.tsx
import { Button } from './ui/button'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { motion } from 'framer-motion'

interface PredictionButtonsProps {
  onPredict: (direction: 'up' | 'down') => void
  disabled?: boolean
}

export function PredictionButtons({ onPredict, disabled }: PredictionButtonsProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Make Your Prediction</h2>
        <p className="text-slate-400">Will the price go UP or DOWN?</p>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* UP Button */}
        <motion.div
          whileHover={{ scale: disabled ? 1 : 1.05 }}
          whileTap={{ scale: disabled ? 1 : 0.95 }}
        >
          <Button
            onClick={() => onPredict('up')}
            disabled={disabled}
            className="
              w-full h-24 text-2xl font-bold transition-all duration-300
              bg-gradient-to-r from-green-500 to-emerald-600 
              hover:from-green-400 hover:to-emerald-500
              border-0 text-white shadow-xl
              hover:shadow-green-500/25
              disabled:opacity-50 disabled:cursor-not-allowed
              relative overflow-hidden
            "
          >
            <div className="flex items-center justify-center space-x-3">
              <TrendingUp className="w-8 h-8" />
              <div className="text-center">
                <div>UP</div>
                <div className="text-sm opacity-75">LONG</div>
              </div>
            </div>
            
            {/* Animated background effect */}
            <motion.div
              className="absolute inset-0 bg-white/10"
              initial={{ x: '-100%' }}
              whileHover={{ x: '100%' }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          </Button>
        </motion.div>

        {/* DOWN Button */}
        <motion.div
          whileHover={{ scale: disabled ? 1 : 1.05 }}
          whileTap={{ scale: disabled ? 1 : 0.95 }}
        >
          <Button
            onClick={() => onPredict('down')}
            disabled={disabled}
            className="
              w-full h-24 text-2xl font-bold transition-all duration-300
              bg-gradient-to-r from-red-500 to-rose-600 
              hover:from-red-400 hover:to-rose-500
              border-0 text-white shadow-xl
              hover:shadow-red-500/25
              disabled:opacity-50 disabled:cursor-not-allowed
              relative overflow-hidden
            "
          >
            <div className="flex items-center justify-center space-x-3">
              <TrendingDown className="w-8 h-8" />
              <div className="text-center">
                <div>DOWN</div>
                <div className="text-sm opacity-75">SHORT</div>
              </div>
            </div>
            
            {/* Animated background effect */}
            <motion.div
              className="absolute inset-0 bg-white/10"
              initial={{ x: '-100%' }}
              whileHover={{ x: '100%' }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          </Button>
        </motion.div>
      </div>
      
      <div className="text-center text-sm text-slate-400">
        Choose your direction and let's see if you can predict the market!
      </div>
    </div>
  )
}