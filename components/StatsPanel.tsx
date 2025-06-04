// Updated StatsPanel.tsx - Always use manual stats calculation
'use client'

import { useState, useEffect } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import {
  Trophy,
  Target,
  TrendingUp,
  Flame,
  BarChart3,
  RefreshCw,
  Users,
  Calendar,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { Prediction } from '@/lib/types'
import { GameRecord, useGameStats, UserStats } from '@/hooks/useGameStats'

interface StatsPanelProps {
  currentPrediction?: Prediction | null
  userAddress?: string
}

export function StatsPanel({ currentPrediction, userAddress }: StatsPanelProps) {
  const [recentGames, setRecentGames] = useState<GameRecord[]>([])
  const [leaderboard, setLeaderboard] = useState<UserStats[]>([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [isLoadingExtras, setIsLoadingExtras] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)

  // ✅ Fix hydration by ensuring consistent rendering
  useEffect(() => {
    setHasMounted(true)
  }, [])

  const {
    userStats,
    gameStats,
    isLoading,
    error,
    loadUserStats, // ✅ SIMPLIFIED: Only one function for loading stats
    getRecentGames,
    getLeaderboard
  } = useGameStats(userAddress)

  // Load additional data when user expands sections
  const loadExtras = async () => {
    if (!userAddress) return

    setIsLoadingExtras(true)
    try {
      const [recent, leaders] = await Promise.all([
        getRecentGames(5),
        getLeaderboard(10)
      ])
      setRecentGames(recent)
      setLeaderboard(leaders)
    } catch (err) {
      console.error('Error loading extra data:', err)
    } finally {
      setIsLoadingExtras(false)
    }
  }

  // Load extras when component mounts if user is connected
  useEffect(() => {
    if (userAddress && !isLoading && hasMounted) {
      loadExtras()
    }
  }, [userAddress, isLoading, hasMounted])

  // ✅ Prevent hydration mismatch by showing loading state until mounted
  if (!hasMounted) {
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
            <div className="text-slate-400">Loading...</div>
          </div>
        </Card>
      </div>
    )
  }

  if (!userAddress) {
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <Target className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-slate-400">
              <div className="font-semibold mb-1">Connect Wallet</div>
              <div className="text-sm">Connect your wallet to track your game statistics</div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
            <div className="text-slate-400">Loading your stats...</div>
          </div>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
            <div className="text-red-400">
              <div className="font-semibold mb-1">Error Loading Stats</div>
              <div className="text-sm">{error}</div>
            </div>
            <Button
              onClick={loadUserStats}
              variant="outline"
              size="sm"
              className="text-red-400 border-red-400 hover:bg-red-400/10"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const winRate = gameStats.winRate

  return (
    <div className="space-y-6">
      {/* Current Game Status */}
      {currentPrediction && (
        <Card className="p-4 bg-slate-900/50 border-slate-800">
          <div className="flex items-center space-x-2 mb-3">
            <Target className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Active Prediction</h3>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Asset:</span>
              <span className="text-white font-bold">{currentPrediction.asset.symbol}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Direction:</span>
              <Badge
                variant="outline"
                className={`
                  ${currentPrediction.direction === 'up'
                    ? 'text-green-400 border-green-400'
                    : 'text-red-400 border-red-400'
                  }
                `}
              >
                {currentPrediction.direction.toUpperCase()}
              </Badge>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Entry:</span>
              <span className="text-white font-mono">${currentPrediction.entryPrice.toFixed(2)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Leverage:</span>
              <span className="text-white">{currentPrediction.leverage || currentPrediction.asset.maxLeverage}x</span>
            </div>
          </div>
        </Card>
      )}

      {/* Game Statistics */}
      <Card className="p-4 bg-slate-900/50 border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-white">Your Stats</h3>
          </div>
          {/* ✅ SIMPLIFIED: Only one refresh button */}
          <Button
            onClick={loadUserStats}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            title="Refresh stats from games"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Win Rate */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400">Win Rate</span>
              <span className="text-white font-bold">{winRate.toFixed(1)}%</span>
            </div>
            <Progress
              value={winRate}
              className="h-2 bg-slate-700"
            />
          </div>

          {/* Total Games */}
          <div className="flex justify-between">
            <span className="text-slate-400">Total Games:</span>
            <span className="text-white font-bold">{gameStats.totalGames}</span>
          </div>

          {/* Wins/Losses */}
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 bg-green-500/10 border border-green-500/20 rounded">
              <div className="text-green-400 font-bold text-lg">{gameStats.wins}</div>
              <div className="text-green-400 text-xs">WINS</div>
            </div>
            <div className="text-center p-2 bg-red-500/10 border border-red-500/20 rounded">
              <div className="text-red-400 font-bold text-lg">{gameStats.losses}</div>
              <div className="text-red-400 text-xs">LOSSES</div>
            </div>
          </div>

          {/* Total P&L */}
          {userStats && userStats.total_pnl !== 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">Total P&L:</span>
              <span className={`font-bold ${userStats.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${userStats.total_pnl.toFixed(2)}
              </span>
            </div>
          )}

        </div>
      </Card>

      {/* Streak Information */}
      <Card className="p-4 bg-slate-900/50 border-slate-800">
        <div className="flex items-center space-x-2 mb-4">
          <Flame className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-white">Streaks</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-400">Current Streak:</span>
            <Badge
              variant={gameStats.currentStreak > 0 ? "default" : "secondary"}
              className={`
                ${gameStats.currentStreak > 0 ? 'bg-green-500' : 'bg-slate-600'}
              `}
            >
              {gameStats.currentStreak}
            </Badge>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Best Streak:</span>
            <Badge variant="outline" className="text-yellow-400 border-yellow-400">
              <Trophy className="w-3 h-3 mr-1" />
              {gameStats.bestStreak}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Recent Games */}
      {recentGames.length > 0 && (
        <Card className="p-4 bg-slate-900/50 border-slate-800">
          <div className="flex items-center space-x-2 mb-4">
            <Calendar className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Recent Games</h3>
          </div>

          <div className="space-y-2">
            {recentGames.slice(0, 3).map((game) => (
              <div
                key={game.id}
                className="flex items-center justify-between p-2 bg-slate-800/50 rounded"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-white font-mono text-sm">{game.asset_symbol}</span>
                  <Badge
                    variant="outline"
                    className={`
                      text-xs ${game.direction === 'up'
                        ? 'text-green-400 border-green-400'
                        : 'text-red-400 border-red-400'
                      }
                    `}
                  >
                    {game.direction.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  {game.real_pnl_dollar && (
                    <span className={`text-xs font-mono ${game.real_pnl_dollar >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                      ${game.real_pnl_dollar.toFixed(3)}
                    </span>
                  )}
                  <Badge
                    variant={game.result === 'win' ? 'default' : 'secondary'}
                    className={`text-xs ${game.result === 'win' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                  >
                    {game.result?.toUpperCase()}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Performance Indicators */}
      {gameStats.totalGames > 0 && (
        <Card className="p-4 bg-slate-900/50 border-slate-800">
          <div className="flex items-center space-x-2 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Performance</h3>
          </div>

          <div className="space-y-3">
            {winRate >= 60 && (
              <div className="p-2 bg-green-500/10 border border-green-500/20 rounded text-center">
                <div className="text-green-400 font-bold text-sm">🔥 ON FIRE!</div>
                <div className="text-green-400 text-xs">High win rate</div>
              </div>
            )}

            {gameStats.currentStreak >= 3 && (
              <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-center">
                <div className="text-yellow-400 font-bold text-sm">⚡ HOT STREAK!</div>
                <div className="text-yellow-400 text-xs">{gameStats.currentStreak} wins in a row</div>
              </div>
            )}

            {gameStats.totalGames >= 10 && winRate < 40 && (
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-center">
                <div className="text-blue-400 font-bold text-sm">💪 KEEP GOING!</div>
                <div className="text-blue-400 text-xs">Practice makes perfect</div>
              </div>
            )}

            {gameStats.totalGames === 0 && (
              <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded text-center">
                <div className="text-purple-400 font-bold text-sm">🚀 READY TO START!</div>
                <div className="text-purple-400 text-xs">Make your first prediction</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Leaderboard Toggle */}
      <Card className="p-4 bg-slate-900/50 border-slate-800">
        <Button
          onClick={() => {
            setShowLeaderboard(!showLeaderboard)
            if (!showLeaderboard && leaderboard.length === 0) {
              loadExtras()
            }
          }}
          variant="outline"
          className="w-full"
          disabled={isLoadingExtras}
        >
          <Users className="w-4 h-4 mr-2" />
          {showLeaderboard ? 'Hide' : 'Show'} Leaderboard
          {isLoadingExtras && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
        </Button>

        {showLeaderboard && leaderboard.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-white font-semibold text-sm">Top Players</h4>
            {leaderboard.slice(0, 5).map((player, index) => (
              <div
                key={player.user_address}
                className={`flex items-center justify-between p-2 rounded ${player.user_address === userAddress
                  ? 'bg-blue-500/20 border border-blue-500/50'
                  : 'bg-slate-800/50'
                  }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-sm">#{index + 1}</span>
                  <span className="text-white text-sm font-mono">
                    {player.user_address.slice(0, 6)}...{player.user_address.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-400 text-sm">{player.win_rate.toFixed(1)}%</span>
                  <span className="text-slate-400 text-xs">({player.total_games})</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}