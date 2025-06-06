// src/hooks/useGameStats.ts - Always use manual calculation
import { useState, useEffect, useCallback } from 'react'
import { Prediction, supabase } from '@/lib/types'

// Database types
export interface GameRecord {
    id: string
    user_address: string
    asset_symbol: string
    direction: 'up' | 'down'
    entry_price: number
    exit_price?: number
    result?: 'win' | 'loss'
    leverage: number
    time_window: number
    position_value: number
    real_pnl_dollar?: number
    created_at: string
    completed_at?: string
}

export interface UserStats {
    user_address: string
    total_games: number
    wins: number
    losses: number
    current_streak: number
    best_streak: number
    win_rate: number
    total_pnl: number
    last_game_at?: string
    created_at: string
    updated_at: string
}

export function useGameStats(userAddress?: string) {
    const [userStats, setUserStats] = useState<UserStats | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // ✅ Manual stats calculation from games data (SOURCE OF TRUTH)
    const calculateStatsFromGames = useCallback(async (games: GameRecord[]): Promise<UserStats> => {
        const completedGames = games.filter(g => g.result)
        const wins = completedGames.filter(g => g.result === 'win').length
        const losses = completedGames.filter(g => g.result === 'loss').length
        const totalPnL = completedGames.reduce((sum, g) => sum + (g.real_pnl_dollar || 0), 0)

        // Calculate current streak (from most recent game backwards)
        let currentStreak = 0
        let bestStreak = 0
        let tempStreak = 0

        // Sort by creation date (most recent first)
        const sortedGames = [...completedGames].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )

        // Calculate current streak (from most recent game backwards)
        for (let i = 0; i < sortedGames.length; i++) {
            const game = sortedGames[i]
            if (i === 0) {
                // First game sets the streak type
                currentStreak = game.result === 'win' ? 1 : 0
            } else {
                // Continue streak only if same result as previous
                if (game.result === sortedGames[i - 1].result) {
                    if (game.result === 'win') {
                        currentStreak++
                    }
                    // For losses, we keep currentStreak at 0
                } else {
                    break // Streak broken
                }
            }
        }

        // Calculate best streak (consecutive wins)
        tempStreak = 0
        for (const game of sortedGames.reverse()) { // Oldest to newest for best streak
            if (game.result === 'win') {
                tempStreak++
                bestStreak = Math.max(bestStreak, tempStreak)
            } else {
                tempStreak = 0
            }
        }

        return {
            user_address: userAddress!,
            total_games: completedGames.length,
            wins,
            losses,
            current_streak: currentStreak,
            best_streak: bestStreak,
            win_rate: completedGames.length > 0 ? (wins / completedGames.length) * 100 : 0,
            total_pnl: totalPnL,
            last_game_at: completedGames[0]?.completed_at,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    }, [userAddress])

    // ✅ MAIN FUNCTION: Always calculate stats from actual games data
    const loadUserStats = useCallback(async (): Promise<void> => {
        if (!userAddress) {
            setUserStats(null)
            return
        }
        setIsLoading(true)
        setError(null)
        try {
            const { data: games, error: gamesError } = await supabase
                .from('games')
                .select('*')
                .eq('user_address', userAddress)
                .not('result', 'is', null)
                .order('created_at', { ascending: false })

            if (gamesError) throw gamesError

            const calculatedStats = await calculateStatsFromGames(games || [])
            setUserStats(calculatedStats)

            // ✅ BEST PLACE TO WRITE TO THE LEADERBOARD TABLE
            // This runs after every calculation, ensuring the leaderboard is always in sync.
            if (calculatedStats.total_games > 0) {
                console.log('📝 Upserting stats to leaderboard table...');
                const { error: upsertError } = await supabase
                    .from('user_stats')
                    .upsert(calculatedStats, { onConflict: 'user_address' });

                if (upsertError) {
                    console.error('❌ Failed to upsert user stats:', upsertError);
                    throw upsertError; // Or handle it more gracefully
                }
                console.log('✅ Leaderboard stats successfully saved.');
            }

        } catch (err) {
            console.error('❌ Error loading/saving stats:', err)
            setError(err instanceof Error ? err.message : 'Failed to load or save stats')
        } finally {
            setIsLoading(false)
        }
    }, [userAddress, calculateStatsFromGames])

    // Start a new game - insert initial record
    const startGame = useCallback(async (
        prediction: Prediction,
        realEntryPrice?: number,
        realPositionSize?: string,
        leverage?: number
    ): Promise<string | null> => {
        if (!userAddress) return null

        try {
            const gameRecord: Partial<GameRecord> = {
                user_address: userAddress,
                asset_symbol: prediction.asset.symbol,
                direction: prediction.direction,
                entry_price: realEntryPrice || prediction.entryPrice,
                leverage: leverage || prediction.leverage || prediction.asset.maxLeverage || 1,
                time_window: prediction.timeWindow,
                position_value: 400,
                created_at: new Date().toISOString()
            }

            const { data, error } = await supabase
                .from('games')
                .insert([gameRecord])
                .select('id')
                .single()

            if (error) throw error

            return data.id
        } catch (err) {
            console.error('Error starting game:', err)
            setError(err instanceof Error ? err.message : 'Failed to start game')
            return null
        }
    }, [userAddress])

    // Complete a game - update record with result and recalculate stats
    const completeGame = useCallback(async (
        gameId: string,
        result: 'win' | 'loss',
        exitPrice: number,
        realPnLDollar?: number
    ): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from('games')
                .update({
                    result,
                    exit_price: exitPrice,
                    real_pnl_dollar: realPnLDollar,
                    completed_at: new Date().toISOString()
                })
                .eq('id', gameId)

            if (error) throw error

            console.log(`🎮 Game completed: ${result}`)

            // Always recalculate stats after game completion
            await loadUserStats()

            return true
        } catch (err) {
            console.error('Error completing game:', err)
            setError(err instanceof Error ? err.message : 'Failed to complete game')
            return false
        }
    }, [loadUserStats])

    // Get recent games for the user
    const getRecentGames = useCallback(async (limit: number = 10): Promise<GameRecord[]> => {
        if (!userAddress) return []

        try {
            const { data, error } = await supabase
                .from('games')
                .select('*')
                .eq('user_address', userAddress)
                .order('created_at', { ascending: false })
                .limit(limit)

            if (error) throw error
            return data || []
        } catch (err) {
            console.error('Error fetching recent games:', err)
            return []
        }
    }, [userAddress])

    // Get leaderboard (we'll still use user_stats table as cache, but manually update it)
    const getLeaderboard = useCallback(async (limit: number = 10): Promise<UserStats[]> => {
        try {
            const { data, error } = await supabase
                .from('user_stats')
                .select('*')
                .gte('total_games', 1)
                .order('win_rate', { ascending: false })
                .order('total_games', { ascending: false })
                .limit(limit)

            if (error) throw error
            return data || []
        } catch (err) {
            console.error('Error fetching leaderboard:', err)
            return []
        }
    }, [])

    // Load stats when userAddress changes
    useEffect(() => {
        loadUserStats()
    }, [loadUserStats])

    return {
        userStats,
        isLoading,
        error,
        loadUserStats, // ✅ RENAMED: This is now the main function
        refreshStats: loadUserStats, // ✅ ALIAS: For compatibility
        recalculateStats: loadUserStats, // ✅ ALIAS: For compatibility
        startGame,
        completeGame,
        getRecentGames,
        getLeaderboard,
        // Legacy GameStats format for compatibility
        gameStats: userStats ? {
            totalGames: userStats.total_games,
            wins: userStats.wins,
            losses: userStats.losses,
            currentStreak: userStats.current_streak,
            bestStreak: userStats.best_streak,
            winRate: userStats.win_rate,
            totalPnL: userStats.total_pnl
        } : {
            totalGames: 0,
            wins: 0,
            losses: 0,
            currentStreak: 0,
            bestStreak: 0,
            winRate: 0,
            totalPnL: 0
        }
    }
}