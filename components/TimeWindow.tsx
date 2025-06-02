// src/components/CombinedSettingsSelector.tsx
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Clock, TrendingUp } from 'lucide-react'
import { Asset } from '@/app/page'

interface CombinedSettingsSelectorProps {
  timeWindow: number
  onTimeWindowSelect: (window: number) => void
  leverage: number
  onLeverageChange: (leverage: number) => void
  disabled?: boolean
  selectedAsset?: Asset | null
}

const TIME_OPTIONS = [
  { value: 15, label: '15s', color: 'bg-red-500 hover:bg-red-600' },
  { value: 30, label: '30s', color: 'bg-orange-500 hover:bg-orange-600' },
  { value: 60, label: '60s', color: 'bg-green-500 hover:bg-green-600' },
]

export function CombinedSettingsSelector({
  timeWindow,
  onTimeWindowSelect,
  leverage,
  onLeverageChange,
  disabled,
  selectedAsset
}: CombinedSettingsSelectorProps) {
  const leverageOptions = [10, 20, 30, 40]
  const marginAmount = 10

  return (
    <div className="space-y-6">
      {/* Time Window Section */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-white">Time Window</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TIME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={timeWindow === option.value ? "default" : "outline"}
              className={`
                h-12 text-sm font-bold transition-all duration-200
                ${timeWindow === option.value
                  ? `${option.color} text-white border-0`
                  : 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-700 text-white'
                }
              `}
              onClick={() => onTimeWindowSelect(option.value)}
              disabled={disabled}
            >
              <div className="text-center">
                <div>{option.label}</div>
                <div className="text-xs opacity-75">
                  {option.value === 15 ? 'BLITZ' : option.value === 30 ? 'QUICK' : 'STEADY'}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-700"></div>

      {/* Leverage Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">Leverage</span>
          </div>
          <Badge variant="outline" className="text-green-400 border-green-400 text-xs">
            $10 margin
          </Badge>
        </div>

        <div className="grid grid-cols-4 gap-2">
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
                className={`px-2 py-3 rounded text-sm font-medium transition-colors relative group ${leverage === option
                  ? 'bg-blue-500 text-white'
                  : isDisabled
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
              >
                <div className="text-center">
                  <div>{option}x</div>
                  <div className="text-xs opacity-75">${positionValue}</div>
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  ${positionValue} position
                  {isMaxForBTC && <div className="text-red-400">Max for BTC</div>}
                  {isMaxForETH && <div className="text-red-400">Max for ETH</div>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Position Value:</span>
            <span className="text-blue-400">${marginAmount * leverage}</span>
          </div>
          <div className="text-center text-orange-400 font-medium">
            Risk $10 margin to control ${marginAmount * leverage} position
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-slate-800/30 rounded-lg p-3 text-center">
        <div className="text-sm text-slate-400">
          Predict <span className="text-white font-semibold">{timeWindow}s</span> price movement with{' '}
          <span className="text-blue-400 font-semibold">{leverage}x</span> leverage
        </div>
      </div>
    </div>
  )
}