// components/DynamicBackground.tsx
'use client'

import { ReactNode, useState, useEffect } from 'react'

interface DynamicBackgroundProps {
    children: ReactNode
    hasActivePosition: boolean
    gameState?: 'idle' | 'countdown' | 'active' | 'result'
    currentPnL?: number // Add PnL prop
}

export function DynamicBackground({
    children,
    hasActivePosition,
    gameState,
    currentPnL = 0
}: DynamicBackgroundProps) {
    // Categorized images based on emotion
    const happyImages = [
        'cheers.png',
        'happy.png',
        'handshake.png',
        'gm.png',
        'liquid.png',
        'saiyan.png',
        'thumbs up.png',
        'hearteyes.png',
        'fire smirk.png',
        'hypurr.png',
        'in my lane.png',
        'samurai.png',
        'throne.png'
    ]

    const sadImages = [
        'dead.png',
        'cry.png',
        'dafuq.png',
        'fire panic.png',
        'shook.png',
        'thumbs down.png',
        'thumbs up sad.png',
        'sweating.png',
        'teacher angry.png',
        'tired.png'
    ]

    const neutralImages = [
        'meowdy.png',
        'purrfessor.png',
        'shrug.png',
        'smoking.png',
        'theories.png',
        'this is fine.png',
        'crystalball.png',
        'meditation.png',
        'notes.png',
        'sherlock.png',
        'teacher-bow.png',
        'calls.png',
        'karate.png',
        'photo.png',
        'ski.png',
        'sleepy.png',
        'snowboard.png'
    ]

    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    // Determine which background state we're in
    const isPositionActive = hasActivePosition || gameState === 'active' || gameState === 'countdown'

    // Choose image array based on PnL
    const getImageArray = () => {
        if (currentPnL > 0) return happyImages
        if (currentPnL < 0) return sadImages
        return neutralImages // When PnL is exactly 0 or undefined
    }

    // Cycle through images when position is active
    useEffect(() => {
        if (!isPositionActive) return

        const imageArray = getImageArray()

        const interval = setInterval(() => {
            setCurrentImageIndex((prevIndex) =>
                (prevIndex + 1) % imageArray.length
            )
        }, 10000) // Increased from 2000 to 4000 (4 seconds)

        return () => clearInterval(interval)
    }, [isPositionActive, currentPnL]) // Add currentPnL to dependencies

    // Reset to first image when position closes
    useEffect(() => {
        if (!isPositionActive) {
            setCurrentImageIndex(0)
        }
    }, [isPositionActive])

    // Reset index when PnL changes category to avoid index out of bounds
    useEffect(() => {
        const imageArray = getImageArray()
        if (currentImageIndex >= imageArray.length) {
            setCurrentImageIndex(0)
        }
    }, [currentPnL, currentImageIndex])

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Base gradient background - always present */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />

            {/* Idle state background */}
            {!isPositionActive && (
                <div className="absolute inset-0">
                    {/* Static idle image */}
                    <div
                        className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-80"
                        style={{
                            backgroundImage: `url('/assets/images/hypurr/sleepy.png')`, // Static idle image
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'bottom right'
                        }}
                    />

                    {/* Additional idle state overlay */}
                    <div className="absolute bottom-0 right-0 w-72 h-72 opacity-5">
                        <div className="w-full h-full bg-gradient-radial from-cyan-400/20 to-transparent rounded-full blur-3xl" />
                    </div>
                </div>
            )}

            {/* Active position background */}
            {isPositionActive && (
                <div className="absolute inset-0">
                    {/* Cycling through emotion-based images */}
                    <div
                        className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-80 transition-all duration-500"
                        style={{
                            backgroundImage: `url('/assets/images/hypurr/${getImageArray()[currentImageIndex]}')`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'bottom right'
                        }}
                    />

                    {/* Active state overlay effects - color based on PnL */}
                    <div className="absolute bottom-0 right-0 w-80 h-80 opacity-20">
                        <div className={`w-full h-full blur-2xl animate-pulse rounded-full ${currentPnL > 0
                            ? 'bg-gradient-radial from-green-400/30 via-emerald-500/15 to-transparent'
                            : currentPnL < 0
                                ? 'bg-gradient-radial from-red-400/30 via-red-500/15 to-transparent'
                                : 'bg-gradient-radial from-blue-400/30 via-blue-500/15 to-transparent'
                            }`} />
                    </div>

                    {/* Additional pulsing effect for active state */}
                    <div className="absolute bottom-10 right-10 w-64 h-64 opacity-10">
                        <div className={`w-full h-full blur-xl animate-spin-slow rounded-full ${currentPnL > 0
                            ? 'bg-gradient-conic from-green-400/20 via-yellow-400/20 to-green-400/20'
                            : currentPnL < 0
                                ? 'bg-gradient-conic from-red-400/20 via-orange-400/20 to-red-400/20'
                                : 'bg-gradient-conic from-blue-400/20 via-purple-400/20 to-blue-400/20'
                            }`} />
                    </div>
                </div>
            )}

            {/* Countdown specific effects */}
            {gameState === 'countdown' && (
                <div className="absolute inset-0">
                    <div className="absolute bottom-0 right-0 w-full h-full opacity-20">
                        <div className="absolute bottom-20 right-20 w-48 h-48 bg-gradient-radial from-orange-400/40 to-transparent rounded-full blur-2xl animate-ping" />
                    </div>
                </div>
            )}

            {/* Content overlay */}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    )
}