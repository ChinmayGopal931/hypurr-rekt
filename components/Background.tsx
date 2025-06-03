// components/DynamicBackground.tsx
'use client'

import { ReactNode, useState, useEffect } from 'react'

interface DynamicBackgroundProps {
    children: ReactNode
    hasActivePosition: boolean
    gameState?: 'idle' | 'countdown' | 'active' | 'result'
}

export function DynamicBackground({
    children,
    hasActivePosition,
    gameState
}: DynamicBackgroundProps) {
    // All the images from your hypurr folder
    const hypurrImages = [
        'cheers.png',
        'dafuq.png',
        'dead.png',
        'fire panic.png',
        'fire smirk.png',
        'gm.png',
        'handshake.png',
        'happy.png',
        'liquid.png',
        'meowdy.png',
        'purrfessor.png',
        'saiyan.png',
        'shook.png',
        'shrug.png',
        'smoking.png',
        'theories.png',
        'this is fine.png',
        'thumbs down.png',
        'thumbs up sad.png',
        'thumbs up.png',
        'cry.png'
    ]

    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    // Determine which background state we're in
    const isPositionActive = hasActivePosition || gameState === 'active' || gameState === 'countdown'

    // Cycle through images when position is active
    useEffect(() => {
        if (!isPositionActive) return

        const interval = setInterval(() => {
            setCurrentImageIndex((prevIndex) =>
                (prevIndex + 1) % hypurrImages.length
            )
        }, 2000) // Change image every 2 seconds

        return () => clearInterval(interval)
    }, [isPositionActive, hypurrImages.length])

    // Reset to first image when position closes
    useEffect(() => {
        if (!isPositionActive) {
            setCurrentImageIndex(0)
        }
    }, [isPositionActive])

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
                            backgroundImage: `url('/assets/images/hypurr/meowdy.png')`, // Static idle image
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
                    {/* Cycling through all hypurr images */}
                    <div
                        className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-80 transition-all duration-500"
                        style={{
                            backgroundImage: `url('/assets/images/hypurr/${hypurrImages[currentImageIndex]}')`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'bottom right'
                        }}
                    />

                    {/* Active state overlay effects */}
                    <div className="absolute bottom-0 right-0 w-80 h-80 opacity-20">
                        <div className="w-full h-full bg-gradient-radial from-green-400/30 via-emerald-500/15 to-transparent rounded-full blur-2xl animate-pulse" />
                    </div>

                    {/* Additional pulsing effect for active state */}
                    <div className="absolute bottom-10 right-10 w-64 h-64 opacity-10">
                        <div className="w-full h-full bg-gradient-conic from-green-400/20 via-yellow-400/20 to-green-400/20 rounded-full blur-xl animate-spin-slow" />
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