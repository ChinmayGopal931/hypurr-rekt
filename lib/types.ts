// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js'

// src/types/game.ts
export type Asset = {
  id: string
  name: string
  symbol: string
  price: number
  maxLeverage: number
  change24h: number
  timestamp: number
}

export type GameState = 'idle' | 'countdown' | 'active' | 'result'

export type Prediction = {
  id: string
  asset: Asset
  direction: 'up' | 'down'
  entryPrice: number
  timeWindow: number
  timestamp: number
  result?: 'win' | 'loss'
  leverage?: number
  exitPrice?: number
}

export type GameStats = {
  totalGames: number
  wins: number
  losses: number
  currentStreak: number
  bestStreak: number
  winRate: number
  totalPnL: number
}
// src/lib/supabase/types.ts
export interface UserStats {
  id: string
  wallet_address: string
  total_games: number
  wins: number
  losses: number
  current_streak: number
  best_streak: number
  win_rate: number
  total_pnl: number
  created_at: string
  updated_at: string
}

export interface GameResult {
  id: string
  wallet_address: string
  asset_symbol: string
  direction: 'up' | 'down'
  entry_price: number
  exit_price?: number
  leverage: number
  time_window: number
  result?: 'win' | 'loss'
  pnl_dollar?: number
  position_size?: string
  actual_entry_price?: number
  created_at: string
  completed_at?: string
}

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}

if (!supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

export const supabase = createClient(supabaseUrl, supabaseKey)