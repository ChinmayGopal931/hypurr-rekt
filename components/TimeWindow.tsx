// src/components/CombinedSettingsSelector.tsx
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Clock, TrendingUp } from 'lucide-react'
import { Asset } from '@/lib/types'

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
  disabled,
}: CombinedSettingsSelectorProps) {
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


        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Position Value:</span>
            <span className="text-blue-400">${marginAmount * leverage}</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-slate-800/30 rounded-lg p-3 text-center">
        <div className="text-sm text-slate-400">
          Guess the price direction using {leverage}x leverage
        </div>
      </div>
    </div>
  )
}