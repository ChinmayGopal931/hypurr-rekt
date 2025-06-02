// src/components/WalletConnection.tsx
import React from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance } from 'wagmi'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Wallet, AlertTriangle, ExternalLink, Activity } from 'lucide-react'
import { useHyperliquid } from '@/hooks/useHyperliquid'

interface WalletConnectionProps {
  onWalletReady?: () => void
}

export function WalletConnection({ onWalletReady }: WalletConnectionProps) {
  const { address, isConnected, chain } = useAccount()
  const { data: balance } = useBalance({ address })

  // Use consolidated Hyperliquid hook for position data
  const { getActivePositions } = useHyperliquid()
  const activePositions = getActivePositions()

  // Notify parent when wallet is ready
  React.useEffect(() => {
    if (isConnected && onWalletReady) {
      onWalletReady()
    }
  }, [isConnected, onWalletReady])

  // Format address for display
  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Check if we're on the correct network (Arbitrum Sepolia for testnet)
  const isCorrectNetwork = chain?.id === 421614 // Arbitrum Sepolia testnet

  // If wallet is connected, show status
  if (isConnected && address) {
    return (
      <Card className="p-4 bg-slate-900/50 border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <Badge variant="outline" className="text-green-400 border-green-400">
                  Connected
                </Badge>
                <span className="text-white font-mono text-sm">
                  {formatAddress(address)}
                </span>
                {!isCorrectNetwork && (
                  <Badge variant="outline" className="text-red-400 border-red-400">
                    Wrong Network
                  </Badge>
                )}
              </div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>
                  Balance: {balance ? `${parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}` : 'Loading...'}
                  {chain && ` • ${chain.name}`}
                </div>
                {activePositions.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <Activity className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-400">
                      {activePositions.length} active position{activePositions.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span>
                      {activePositions.map(p => `${p.asset} ${p.direction.toUpperCase()}`).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {chain && (
              <a
                href={`${chain.blockExplorers?.default.url}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-white transition-colors"
                title="View on Explorer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <ConnectButton
              showBalance={false}
              chainStatus="none"
              accountStatus="avatar"
            />
          </div>
        </div>

        {/* Network warning */}
        {!isCorrectNetwork && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10 mt-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-400">
              <div className="font-semibold mb-1">Wrong Network</div>
              <div className="text-sm">
                Please switch to Arbitrum Sepolia testnet for Hyperliquid trading.
              </div>
            </AlertDescription>
          </Alert>
        )}
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

        <div className="space-y-3">
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openChainModal,
              openConnectModal,
              authenticationStatus,
              mounted,
            }) => {
              // Note: If your app doesn't use authentication, you
              // can remove all 'authenticationStatus' checks
              const ready = mounted && authenticationStatus !== 'loading';
              const connected =
                ready &&
                account &&
                chain &&
                (!authenticationStatus ||
                  authenticationStatus === 'authenticated');

              return (
                <div
                  {...(!ready && {
                    'aria-hidden': true,
                    'style': {
                      opacity: 0,
                      pointerEvents: 'none',
                      userSelect: 'none',
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <button
                          onClick={openConnectModal}
                          className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                        >
                          <Wallet className="w-5 h-5" />
                          <span>Connect Wallet</span>
                        </button>
                      );
                    }

                    if (chain.unsupported) {
                      return (
                        <button
                          onClick={openChainModal}
                          className="w-full h-12 text-lg font-semibold bg-red-500 hover:bg-red-400 text-white rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
                        >
                          <AlertTriangle className="w-5 h-5" />
                          <span>Wrong Network</span>
                        </button>
                      );
                    }

                    return null;
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>

          <div className="text-xs text-slate-500 space-y-1">
            <div>• Arbitrum Sepolia testnet required</div>
            <div>• $10 prediction size per trade</div>
            <div>• Real orders, testnet ETH only</div>
            <div>• Automatic position management</div>
          </div>
        </div>

        {/* Wallet detection */}
        {typeof window !== 'undefined' && !window.ethereum && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-400">
              <div className="space-y-2">
                <div className="font-semibold">No wallet detected</div>
                <div className="text-sm">Please install a compatible wallet to continue.</div>
                <div className="flex items-center space-x-4 text-sm">
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-400 hover:text-blue-300 underline"
                  >
                    MetaMask <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                  <a
                    href="https://rainbow.me/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-400 hover:text-blue-300 underline"
                  >
                    Rainbow <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Testnet info */}
        <Alert className="border-blue-500/50 bg-blue-500/10">
          <AlertTriangle className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-400">
            <div className="space-y-2">
              <div className="font-semibold">Testnet Trading</div>
              <div className="text-sm">
                This app uses Hyperliquid testnet. You'll need testnet ETH on Arbitrum Sepolia.
              </div>
              <a
                href="https://faucet.arbitrum.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-white hover:text-blue-200 underline"
              >
                Get Testnet ETH <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </Card>
  )
}