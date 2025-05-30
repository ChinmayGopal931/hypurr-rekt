// src/components/TimeWindowSelector.tsx
import { Button } from './ui/button'
import { Clock } from 'lucide-react'

interface TimeWindowSelectorProps {
  timeWindow: number
  onTimeWindowSelect: (window: number) => void
  disabled?: boolean
}

const TIME_OPTIONS = [
  { value: 15, label: '15s', color: 'bg-red-500 hover:bg-red-600' },
  { value: 30, label: '30s', color: 'bg-orange-500 hover:bg-orange-600' },
  { value: 60, label: '60s', color: 'bg-green-500 hover:bg-green-600' },
]

export function TimeWindowSelector({ timeWindow, onTimeWindowSelect, disabled }: TimeWindowSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Clock className="w-5 h-5 text-slate-400" />
        <h3 className="text-lg font-semibold text-white">Time Window</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {TIME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={timeWindow === option.value ? "default" : "outline"}
            className={`
              h-16 text-lg font-bold transition-all duration-200 hover:scale-105
              ${timeWindow === option.value 
                ? `${option.color} text-white border-0` 
                : 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-700 text-white'
              }
            `}
            onClick={() => onTimeWindowSelect(option.value)}
            disabled={disabled}
          >
            <div className="text-center">
              <div className="text-xl">{option.label}</div>
              <div className="text-xs opacity-75">
                {option.value === 15 ? 'BLITZ' : option.value === 30 ? 'QUICK' : 'STEADY'}
              </div>
            </div>
          </Button>
        ))}
      </div>
      
      <div className="text-center text-sm text-slate-400">
        Predict price movement in the next <span className="text-white font-semibold">{timeWindow} seconds</span>
      </div>
    </div>
  )
}