// src/components/AssetSelector.tsx
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Asset } from '@/lib/types'

interface AssetSelectorProps {
  assets: Asset[]
  selectedAsset: Asset | null  // Allow null
  onAssetSelect: (asset: Asset) => void
  disabled?: boolean
}

export function AssetSelector({ assets, selectedAsset, onAssetSelect, disabled }: AssetSelectorProps) {
  if (assets.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Select Asset</h3>
        <div className="text-slate-400 text-center py-8">
          Loading assets...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Select Asset</h3>
      
      <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
        {assets.map((asset) => (
          <Button
            key={asset.id}
            variant={selectedAsset?.id === asset.id ? "default" : "outline"}
            className={`
              h-auto p-4 justify-between hover:scale-[1.02] transition-all duration-200
              ${selectedAsset?.id === asset.id 
                ? 'bg-blue-600 hover:bg-blue-700 border-blue-500' 
                : 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-700'
              }
            `}
            onClick={() => onAssetSelect(asset)}
            disabled={disabled}
          >
            <div className="flex items-center space-x-3">
              <div className="text-left">
                <div className="font-semibold text-white">{asset.symbol}</div>
                <div className="text-sm text-slate-300">{asset.name}</div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="font-mono text-white">
                ${asset.price.toLocaleString(undefined, { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: asset.price > 1000 ? 2 : 4
                })}
              </div>
              <Badge 
                variant="outline"
                className={`
                  ${asset.change24h >= 0 
                    ? 'text-green-400 border-green-400' 
                    : 'text-red-400 border-red-400'
                  }
                `}
              >
                {asset.change24h >= 0 ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(1)}%
              </Badge>
            </div>
          </Button>
        ))}
      </div>
      
      <div className="text-xs text-slate-400 text-center">
        {assets.length} assets available • Real-time prices
      </div>
    </div>
  )
}