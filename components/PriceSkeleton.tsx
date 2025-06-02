import { Loader2 } from "lucide-react"
import { Card } from "./ui/card"

export const PriceSkeleton = () => (
    <div className="animate-pulse">
        <div className="text-center space-y-4">
            <div className="space-y-2">
                <div className="h-6 bg-slate-700 rounded w-32 mx-auto"></div>
                <div className="h-10 bg-slate-700 rounded w-48 mx-auto"></div>
                <div className="h-4 bg-slate-700 rounded w-24 mx-auto"></div>
            </div>
        </div>
    </div>
)

export const AssetSkeleton = () => (
    <div className="animate-pulse">
        <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50">
            <div className="w-8 h-8 bg-slate-700 rounded-full"></div>
            <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                <div className="h-3 bg-slate-700 rounded w-1/2"></div>
            </div>
            <div className="text-right space-y-2">
                <div className="h-4 bg-slate-700 rounded w-16"></div>
                <div className="h-3 bg-slate-700 rounded w-12"></div>
            </div>
        </div>
    </div>
)


export const Loading = () => (
    <div className="space-y-6">
        <Card className="p-8 bg-slate-900/50 border-slate-800">
            <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <div className="text-white text-lg font-semibold">Loading Hyperliquid Data</div>
                <div className="text-center text-slate-400 space-y-1">
                    <div>Connecting to Hyperliquid Testnet</div>
                    <div className="text-sm">Fetching real-time crypto prices...</div>
                </div>
            </div>
        </Card>
    </div>
)
