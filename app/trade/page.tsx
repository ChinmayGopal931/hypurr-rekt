// app/trade/page.tsx - Updated for Supabase integration
'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi' // Add this import for wallet connection
import { GameInterface } from '@/components/GameInterface'
import { StatsPanel } from '@/components/StatsPanel'
import { Header } from '@/components/GameHeader'
import { DynamicBackground } from '@/components/Background'
import { Prediction } from '@/lib/types'
import { useAudio } from '@/hooks/useAudio'

export type GameState = 'idle' | 'countdown' | 'active' | 'result'

export default function TradePage() {
    const [gameState, setGameState] = useState<GameState>('idle')
    const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null)
    const [soundEnabled, setSoundEnabled] = useState(true)

    // Get wallet connection info
    const { address } = useAccount()
    const audioFunctions = useAudio(soundEnabled)


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
                            soundEnabled={soundEnabled}
                            audioFunctions={audioFunctions}
                        // ❌ REMOVED: gameStats and setGameStats props
                        // The GameInterface now handles its own database operations
                        />
                    </div>

                    {/* Stats Panel */}
                    <div className="xl:col-span-1">
                        <StatsPanel
                            currentPrediction={currentPrediction}
                            userAddress={address} // ✅ CHANGED: Pass wallet address instead of gameStats
                        // ❌ REMOVED: gameStats prop
                        />
                    </div>
                </div>
            </div>
        </DynamicBackground>
    )
}