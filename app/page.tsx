// app/page.tsx (replace your current page.tsx)
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [currentCatIndex, setCurrentCatIndex] = useState(0)

  // Add custom CSS for slow float animation
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-15px); }
      }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  // Cat images for cycling - updated with full collection
  const catImages = [
    'crystalball.png', 'cheers.png', 'hearteyes.png', 'dafuq.png', 'dead.png', 'fire panic.png',
    'fire smirk.png', 'gm.png', 'handshake.png', 'happy.png', 'hypurr.png', 'liquid.png',
    'meowdy.png', 'purrfessor.png', 'saiyan.png', 'shook.png', 'shrug.png', 'smoking.png',
    'theories.png', 'this is fine.png', 'thumbs down.png', 'thumbs up sad.png', 'thumbs up.png',
    'in my lane.png', 'meditation.png', 'notes.png', 'samurai.png', 'sherlock.png', 'sweating.png',
    'teacher angry.png', 'teacher-bow.png', 'calls.png', 'karate.png', 'photo.png', 'ski.png',
    'sleepy.png', 'snowboard.png', 'throne.png', 'tired.png'
  ]

  // Cycle hero cat image
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCatIndex((prev) => (prev + 1) % catImages.length)
    }, 4000) // Changed from 2000 to 4000 (4 seconds)

    return () => clearInterval(interval)
  }, [catImages.length])

  // Create floating background cats
  useEffect(() => {
    const createFloatingCat = () => {
      const cat = document.createElement('img')
      const randomImage = catImages[Math.floor(Math.random() * catImages.length)]
      cat.src = `/assets/images/hypurr/${randomImage}`
      cat.className = 'absolute w-8 h-8 opacity-10 pointer-events-none animate-pulse'
      cat.style.left = Math.random() * 100 + '%'
      cat.style.top = Math.random() * 100 + '%'
      cat.style.animationDuration = (3 + Math.random() * 4) + 's'
      cat.style.animationDelay = Math.random() * 2 + 's'

      const container = document.getElementById('floating-cats')
      if (container) {
        container.appendChild(cat)

        // Remove after animation
        setTimeout(() => {
          if (cat.parentNode) {
            cat.parentNode.removeChild(cat)
          }
        }, 10000)
      }
    }

    const interval = setInterval(createFloatingCat, 5000) // Changed from 3000 to 5000
    return () => clearInterval(interval)
  }, [catImages])

  const enterApp = () => {
    router.push('/trade')
  }

  const scrollToHow = () => {
    document.getElementById('how-it-works')?.scrollIntoView({
      behavior: 'smooth'
    })
  }

  return (
    <div className="bg-slate-950 text-white overflow-x-hidden">
      {/* Background Grid */}
      <div className="fixed inset-0 opacity-20" style={{
        backgroundImage: `
          linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px'
      }}></div>

      {/* Animated Background Cats */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div id="floating-cats" className="absolute inset-0"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-emerald-500/20">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 font-bold text-lg">📈</span>
              </div>
              <div className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent font-bold text-xl">
                HYPURREKT
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Hyperliquid Link */}
              <a
                href="https://hyperliquid.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-slate-300 hover:text-emerald-400 transition-colors duration-200 group"
              >
                <img src="/assets/HyperCore mint.svg" alt="Speed" className="w-20 h-20 object-contain" />

              </a>
              <div className="text-sm text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
                TESTNET
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-24 pb-16 px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Side - Content */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="text-emerald-400 font-semibold text-lg">
                    Purr-fect Price Predictions
                  </div>
                  <h1 className="text-5xl lg:text-7xl font-black leading-tight">
                    <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                      15 SECOND
                    </span>
                    <span className="text-white">BETS</span>
                  </h1>
                  <p className="text-xl text-slate-300 leading-relaxed">
                    Pick any crypto from Hyperliquid&apos;s full asset list. Go long or short with maximum leverage. Watch live orderbook data while your trade runs for 15, 30, or 60 seconds.
                  </p>
                </div>

                {/* Features */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-900/50 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <div className="w-8 h-8 mx-auto mb-2">
                      <img src="/assets/images/hypurr/liquid.png" alt="Speed" className="w-full h-full object-contain" />
                    </div>
                    <div className="font-semibold text-emerald-400">15-60 Seconds</div>
                    <div className="text-sm text-slate-400">Quick trades</div>
                  </div>
                  <div className="bg-slate-900/50 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <div className="w-8 h-8 mx-auto mb-2">
                      <img src="/assets/images/hypurr/crystalball.png" alt="Assets" className="w-full h-full object-contain" />
                    </div>
                    <div className="font-semibold text-emerald-400">All HL Assets</div>
                    <div className="text-sm text-slate-400">Full Hyperliquid catalog</div>
                  </div>
                  <div className="bg-slate-900/50 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <div className="w-8 h-8 mx-auto mb-2">
                      <img src="/assets/images/hypurr/theories.png" alt="Leverage" className="w-full h-full object-contain" />
                    </div>
                    <div className="font-semibold text-emerald-400">Max Leverage</div>
                    <div className="text-sm text-slate-400">Highest possible for each asset</div>
                  </div>
                </div>


                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={enterApp}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg px-8 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg shadow-emerald-500/25"
                  >
                    Try It
                  </button>
                  <button
                    onClick={scrollToHow}
                    className="border-2 border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-black font-semibold px-8 py-4 rounded-xl transition-all duration-300"
                  >
                    How It Works
                  </button>
                </div>
              </div>

              {/* Right Side - Animated Cat Hero */}
              <div className="relative flex items-center justify-center">
                <div className="relative">
                  {/* Main Cat Display */}
                  <div className="w-80 h-80 relative" style={{
                    animation: 'float 6s ease-in-out infinite'
                  }}>
                    <img
                      src={`/assets/images/hypurr/${catImages[currentCatIndex]}`}
                      alt="Hyperliquid Cat"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Glow Effect */}
                  <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-3xl -z-10"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-16 px-6 bg-slate-900/30">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-4xl font-bold mb-12">
              <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                How It Works
              </span>
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="w-20 h-20 mx-auto bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                  <img src="/assets/images/hypurr/crystalball.png" alt="Choose" className="w-16 h-16 object-contain" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400">1. Pick</h3>
                <p className="text-slate-300">Choose any crypto and set your timer (15, 30, or 60 seconds)</p>
              </div>

              <div className="space-y-4">
                <div className="w-20 h-20 mx-auto bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                  <img src="/assets/images/hypurr/samurai.png" alt="Bet" className="w-16 h-16 object-contain" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400">2. Bet</h3>
                <p className="text-slate-300">Go long or short with leverage</p>
              </div>

              <div className="space-y-4">
                <div className="w-20 h-20 mx-auto bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                  <img src="/assets/images/hypurr/throne.png" alt="Win" className="w-16 h-16 object-contain" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400">3. Wait</h3>
                <p className="text-slate-300">Watch the countdown and see what happens</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-emerald-500/20">
          <div className="container mx-auto max-w-4xl">
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="flex items-center space-x-3 mb-4 md:mb-0">
                <div className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent font-bold text-lg">
                  HYPURREKT
                </div>
                <span className="text-slate-400">•</span>
                <a
                  href="https://hyperliquid.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-emerald-400 transition-colors duration-200 flex items-center space-x-1"
                >
                  <span>Built on</span>
                  <span className="font-semibold">Hyperliquid</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <div className="flex items-center space-x-6 text-sm text-slate-400">
                <span>Testnet</span>
                <span>Side Project</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <div className="flex items-center justify-center space-x-2 text-slate-500 text-sm">
                <img src="/assets/images/hypurr/meditation.png" alt="Cat" className="w-6 h-6" />
                <span>A thing I built</span>
                <img src="/assets/images/hypurr/sleepy.png" alt="Cat" className="w-6 h-6" />
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}