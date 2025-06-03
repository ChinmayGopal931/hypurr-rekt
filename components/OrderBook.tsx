import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity, Wifi, WifiOff } from 'lucide-react'
import { ProcessedOrderLevel } from '@/hooks/useHyperliquid'
import { useOrderBook } from '@/hooks/useHyperliquidSubscription'
import { processOrderBook } from '@/lib/utils'

interface OrderBookProps {
    coin: string
    currentPrice?: number
    isWinning?: boolean | null
}

interface OrderLevelRowProps {
    level: ProcessedOrderLevel
    type: 'bid' | 'ask'
    isFirst?: boolean
}

function OrderLevelRow({ level, type, isFirst }: OrderLevelRowProps) {
    const isBid = type === 'bid'
    const textColor = isBid ? 'text-green-400' : 'text-red-400'
    const bgColor = isBid ? 'bg-green-500' : 'bg-red-500'

    return (
        <motion.div
            initial={{ opacity: 0, x: isBid ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className={`
        relative flex items-center justify-between px-3 py-1.5 text-sm font-mono
        hover:bg-slate-700/50 transition-colors duration-200
        ${isFirst ? (isBid ? 'border-b border-green-500/30' : 'border-t border-red-500/30') : ''}
      `}
        >
            {/* Size bar background */}
            <div
                className={`
          absolute left-0 top-0 h-full ${bgColor}/10 transition-all duration-300
          ${isBid ? 'right-0' : 'left-0'}
        `}
                style={{
                    width: `${level.sizePercent}%`,
                    ...(isBid ? { right: 0, left: 'auto' } : { left: 0 })
                }}
            />

            {/* Total bar background (darker) */}
            <div
                className={`
          absolute left-0 top-0 h-full ${bgColor}/5 transition-all duration-300
        `}
                style={{
                    width: `${level.totalPercent}%`,
                    ...(isBid ? { right: 0, left: 'auto' } : { left: 0 })
                }}
            />

            {/* Content */}
            <div className="relative z-10 flex items-center justify-between w-full">
                <div className={`font-bold ${textColor}`}>
                    ${level.price.toFixed(2)}
                </div>
                <div className="text-slate-300">
                    {level.size.toFixed(2)}
                </div>
                <div className="text-slate-400 text-xs">
                    {level.total.toFixed(2)}
                </div>
            </div>
        </motion.div>
    )
}

export function OrderBook({ coin, currentPrice, isWinning }: OrderBookProps) {
    const orderBookQuery = useOrderBook(coin)

    const processedData = useMemo(() => {
        return processOrderBook(orderBookQuery.data ?? null)
    }, [orderBookQuery.data])

    const isLoading = orderBookQuery.isLoading
    const isConnected = !orderBookQuery.isError && !!orderBookQuery.data
    const lastUpdate = orderBookQuery.dataUpdatedAt

    // Find best bid and ask for spread calculation
    const bestBid = processedData?.bids[0]?.price
    const bestAsk = processedData?.asks[0]?.price
    const spread = bestBid && bestAsk ? bestAsk - bestBid : 0
    const spreadPercent = bestBid && spread ? (spread / bestBid) * 100 : 0

    if (isLoading) {
        return (
            <div className="p-6 bg-slate-800/30 rounded-xl border border-slate-700">
                <div className="flex items-center justify-center space-x-2 mb-4">
                    <Activity className="w-5 h-5 animate-pulse text-blue-400" />
                    <span className="text-slate-400">Loading order book...</span>
                </div>
                <div className="space-y-2">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="h-8 bg-slate-700/50 rounded animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (!processedData) {
        return (
            <div className="p-6 bg-slate-800/30 rounded-xl border border-red-500/50">
                <div className="flex items-center justify-center space-x-2 text-red-400">
                    <WifiOff className="w-5 h-5" />
                    <span>Failed to load order book</span>
                </div>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
        bg-slate-800/30 rounded-xl border-2 transition-all duration-300
        ${isWinning === true ? 'border-green-500/50 bg-green-500/5' :
                    isWinning === false ? 'border-red-500/50 bg-red-500/5' :
                        'border-slate-700'}
        shadow-lg
      `}
        >
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        <span className="text-lg font-bold text-white">{coin} Order Book</span>
                        {isConnected ? (
                            <Wifi className="w-4 h-4 text-green-400" />
                        ) : (
                            <WifiOff className="w-4 h-4 text-red-400" />
                        )}
                    </div>
                    {lastUpdate && (
                        <div className="text-xs text-slate-500">
                            Last: {new Date(lastUpdate).toLocaleTimeString()}
                        </div>
                    )}
                </div>

                {/* Column Headers */}
                <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-400 bg-slate-900/50 rounded">
                    <span>Price ({coin})</span>
                    <span>Size</span>
                    <span>Total</span>
                </div>
            </div>

            {/* Order Book Content */}
            <div className="p-2">
                {/* Asks (Sell Orders) - Red */}
                <div className="mb-4">
                    <div className="flex items-center space-x-1 mb-2 px-2">
                        <TrendingDown className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-red-400">
                            Asks ({processedData.asks.length})
                        </span>
                    </div>
                    <div className="space-y-0.5">
                        {processedData.asks.slice(0, 5).reverse().map((ask, index) => (
                            <OrderLevelRow
                                key={`ask-${ask.price}`}
                                level={ask}
                                type="ask"
                                isFirst={index === processedData.asks.length - 1}
                            />
                        ))}
                    </div>
                </div>

                {/* Current Price & Spread */}
                {currentPrice && (
                    <div className="my-4 p-3 bg-slate-900/50 rounded-lg border border-slate-600">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-slate-400">Current Price:</span>
                                <span className="text-lg font-bold font-mono text-white">
                                    ${currentPrice.toFixed(2)}
                                </span>
                                {isWinning === true && <TrendingUp className="w-4 h-4 text-green-400" />}
                                {isWinning === false && <TrendingDown className="w-4 h-4 text-red-400" />}
                            </div>
                            {spread > 0 && (
                                <div className="text-right">
                                    <div className="text-xs text-slate-400">Spread</div>
                                    <div className="text-sm font-mono text-slate-300">
                                        ${spread.toFixed(2)} ({spreadPercent.toFixed(3)}%)
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Bids (Buy Orders) - Green */}
                <div>
                    <div className="flex items-center space-x-1 mb-2 px-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">
                            Bids ({processedData.bids.length})
                        </span>
                    </div>
                    <div className="space-y-0.5">
                        {processedData.bids.slice(0, 5).map((bid, index) => (
                            <OrderLevelRow
                                key={`bid-${bid.price}`}
                                level={bid}
                                type="bid"
                                isFirst={index === 0}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer Stats */}
            <div className="p-3 border-t border-slate-700 bg-slate-900/30">
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-4">
                        <div className="text-slate-400">
                            Bid Total: <span className="text-green-400 font-mono">
                                {processedData.bids.reduce((sum, bid) => sum + bid.size, 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="text-slate-400">
                            Ask Total: <span className="text-red-400 font-mono">
                                {processedData.asks.reduce((sum, ask) => sum + ask.size, 0).toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="text-slate-500">
                        {processedData.bids.length + processedData.asks.length} levels
                    </div>
                </div>
            </div>
        </motion.div>
    )
}