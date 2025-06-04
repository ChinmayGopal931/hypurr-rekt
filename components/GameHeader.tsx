// src/components/Header.tsx
import { Button } from './ui/button'
import { Volume2, VolumeX, TrendingUp } from 'lucide-react'

interface HeaderProps {
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
}

export function Header({ soundEnabled, setSoundEnabled }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">HYPURREKT</h1>
            </div>
          </div>


          {/* Controls */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2"
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-slate-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}