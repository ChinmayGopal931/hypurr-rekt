'use client'

import { useState } from 'react'
import { GameInterface } from '@/components/GameInterface'
import { StatsPanel } from '@/components/StatsPanel'
import { Header } from '@/components/GameHeader'
import { Prediction } from '@/lib/types'

export type GameState = 'idle' | 'countdown' | 'active' | 'result'

export type GameStats = {
  totalGames: number
  wins: number
  losses: number
  currentStreak: number
  bestStreak: number
  winRate: number
  totalPnL: number
}

export default function Home() {
  const [gameState, setGameState] = useState<GameState>('idle')
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null)
  const [gameStats, setGameStats] = useState<GameStats>({
    totalGames: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    winRate: 0,
    totalPnL: 0
  })

  const [soundEnabled, setSoundEnabled] = useState(true)

  return (
    <div className="min-h-screen">
      <Header
        gameStats={gameStats}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
      />

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Game Interface */}
          <div className="xl:col-span-3">
            <GameInterface
              gameState={gameState}
              setGameState={setGameState}
              currentPrediction={currentPrediction}
              setCurrentPrediction={setCurrentPrediction}
              gameStats={gameStats}
              setGameStats={setGameStats}
              soundEnabled={soundEnabled}
            />
          </div>

          {/* Stats Panel */}
          <div className="xl:col-span-1">
            <StatsPanel
              gameStats={gameStats}
              currentPrediction={currentPrediction}
            />
          </div>
        </div>
      </div>
    </div>
  )
}