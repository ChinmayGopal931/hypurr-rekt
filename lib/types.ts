// src/types/game.ts
export type Asset = {
    id: string
    name: string
    symbol: string
    price: number
    change24h: number
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