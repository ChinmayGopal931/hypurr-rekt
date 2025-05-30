// src/components/WalletConnection.tsx
import React from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { useWalletOrders } from '@/hooks/useWalletOrders'
import { Wallet, AlertTriangle, Loader2, ExternalLink, LogOut } from 'lucide-react'

interface WalletConnectionProps {
  onWalletReady?: () => void
}

export function WalletConnection({ onWalletReady }: WalletConnectionProps) {
  const {
    wallet,
    isConnecting,
    walletError,
    connectWallet,
    disconnectWallet,
    activePositions
  } = useWalletOrders()

  // Notify parent when wallet is ready
  React.useEffect(() => {
    if (wallet?.isConnected && onWalletReady) {
      onWalletReady()
    }
  }, [wallet?.isConnected, onWalletReady])

  // Format address for display
  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // If wallet is connected, show status
  if (wallet?.isConnected) {
    return (
      <Card className="p-4 bg-slate-900/50 border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-green-400 border-green-400">
                  Connected
                </Badge>
                <span className="text-white font-mono text-sm">
                  {formatAddress(wallet.address)}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Balance: {parseFloat(wallet.balance || '0').toFixed(4)} ETH
                {activePositions.length > 0 && ` • ${activePositions.length} active position(s)`}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <a
              href={`https://testnet.arbiscan.io/address/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <Button
              onClick={disconnectWallet}
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  // If wallet is not connected, show connection interface
  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
          <Wallet className="w-8 h-8 text-blue-400" />
        </div>
        
        <div>
          <h3 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h3>
          <p className="text-slate-400 text-sm">
            Connect your wallet to place real predictions on Hyperliquid Testnet
          </p>
        </div>

        {walletError && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">
              {walletError}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="w-5 h-5 mr-2" />
                Connect MetaMask
              </>
            )}
          </Button>
          
          <div className="text-xs text-slate-500 space-y-1">
            <div>• Testnet only - no real money involved</div>
            <div>• $10 prediction size per trade</div>
            <div>• Automatic position management</div>
          </div>
        </div>

        {!window.ethereum && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-400">
              <div className="space-y-2">
                <div>No wallet detected. Please install MetaMask to continue.</div>
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-400 hover:text-blue-300 underline"
                >
                  Download MetaMask <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  )
}