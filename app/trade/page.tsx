// app/trade/page.tsx (create this new file)
'use client'

import { useState } from 'react'
import { GameInterface } from '@/components/GameInterface'
import { StatsPanel } from '@/components/StatsPanel'
import { Header } from '@/components/GameHeader'
import { DynamicBackground } from '@/components/Background'
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

export default function TradePage() {
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

    // Determine if there's an active position
    const hasActivePosition = currentPrediction !== null && (gameState === 'active' || gameState === 'countdown')

    // Calculate real-time PnL
    const calculatePnL = (): number => {
        if (!currentPrediction || !currentPrediction.asset) return 0

        const entryPrice = currentPrediction.entryPrice
        const currentPrice = currentPrediction.asset.price
        const direction = currentPrediction.direction

        if (direction === 'up') {
            return currentPrice - entryPrice
        } else {
            return entryPrice - currentPrice
        }
    }

    const currentPnL = calculatePnL()

    return (
        <DynamicBackground
            hasActivePosition={hasActivePosition}
            gameState={gameState}
            currentPnL={currentPnL}
        >
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
        </DynamicBackground>
    )
}