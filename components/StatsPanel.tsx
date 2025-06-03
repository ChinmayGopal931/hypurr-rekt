import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { GameStats } from '@/app/page'
import { Trophy, Target, TrendingUp, Flame, BarChart3 } from 'lucide-react'
import { Prediction } from '@/lib/types'

interface StatsPanelProps {
  gameStats: GameStats
  currentPrediction?: Prediction | null
}

export function StatsPanel({ gameStats, currentPrediction }: StatsPanelProps) {
  const winRate = gameStats.totalGames > 0 ? (gameStats.wins / gameStats.totalGames) * 100 : 0

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
              <span className="text-slate-400">Duration:</span>
              <span className="text-white">{currentPrediction.timeWindow}s</span>
            </div>
          </div>
        </Card>
      )}

      {/* Game Statistics */}
      <Card className="p-4 bg-slate-900/50 border-slate-800">
        <div className="flex items-center space-x-2 mb-4">
          <BarChart3 className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-white">Game Stats</h3>
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
    </div>
  )
}