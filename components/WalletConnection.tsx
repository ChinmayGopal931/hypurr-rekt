// Updated WalletConnection.tsx with typed hooks and best practices
import React, { JSX, useCallback, useMemo } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Wallet, AlertTriangle, ExternalLink, Activity, Loader2, CheckCircle } from 'lucide-react'
import { usePositions } from '@/hooks/useHyperliquid'
import type { PositionInfo } from '@/service/hyperliquidOrders'
import { hyperliquid } from '@/service/hyperliquid'

interface WalletConnectionProps {
  onWalletReady?: () => void
}

interface FormattedPosition {
  asset: string
  direction: string
  displayText: string
}

export function WalletConnection({ onWalletReady }: WalletConnectionProps): JSX.Element {
  const { address, isConnected, chain } = useAccount()

  // Use typed positions hook for better performance
  const positionsQuery = usePositions(address)
  const activePositions = positionsQuery.data || []

  // Notify parent when wallet is ready
  React.useEffect(() => {
    if (isConnected && onWalletReady) {
      onWalletReady()
    }
  }, [isConnected, onWalletReady])

  // Memoized helper functions for better performance
  const formatAddress = useCallback((address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }, [])

  // Check if we're on the correct network (Arbitrum Sepolia for testnet)
  const isCorrectNetwork = useMemo(() => chain?.id === (hyperliquid.useTestnet ? 421614 : 42161), [chain?.id])

  // Format positions for display
  const formattedPositions = useMemo((): FormattedPosition[] => {
    return activePositions.map((position: PositionInfo) => ({
      asset: position.asset,
      direction: position.direction.toUpperCase(),
      displayText: `${position.asset} ${position.direction.toUpperCase()}`
    }))
  }, [activePositions])


  // Network status
  const networkStatus = useMemo(() => {
    if (!chain) return { name: 'Unknown', isCorrect: false }
    return { name: chain.name, isCorrect: isCorrectNetwork }
  }, [chain, isCorrectNetwork])

  // Position summary text
  const positionSummary = useMemo(() => {
    if (activePositions.length === 0) return null
    if (activePositions.length === 1) return '1 active position'
    return `${activePositions.length} active positions`
  }, [activePositions.length])

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
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
                <span className="text-white font-mono text-sm">
                  {formatAddress(address)}
                </span>
                {!networkStatus.isCorrect && (
                  <Badge variant="outline" className="text-red-400 border-red-400">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Wrong Network
                  </Badge>
                )}
              </div>

              <div className="text-xs text-slate-400 space-y-0.5">
                {/* Balance and Network Info */}
                <div className="flex items-center space-x-2">
                  {networkStatus.name && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span>{networkStatus.name}</span>
                    </>
                  )}
                </div>

                {/* Positions Info */}
                {positionsQuery.isLoading ? (
                  <div className="flex items-center space-x-1">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                    <span className="text-blue-400">Loading positions...</span>
                  </div>
                ) : positionsQuery.error ? (
                  <div className="flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">Position data unavailable</span>
                  </div>
                ) : activePositions.length > 0 ? (
                  <div className="flex items-center space-x-1">
                    <Activity className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-400">{positionSummary}</span>
                    <span className="text-slate-500">•</span>
                    <span className="max-w-48 truncate">
                      {formattedPositions.map(p => p.displayText).join(', ')}
                    </span>
                  </div>
                ) : (
                  <div className="text-slate-500">No active positions</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Explorer Link */}
            {chain?.blockExplorers?.default && (
              <a
                href={`${chain.blockExplorers.default.url}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-white transition-colors"
                title="View on Explorer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            {/* Connect Button */}
            <ConnectButton
              showBalance={false}
              chainStatus="none"
              accountStatus="avatar"
            />
          </div>
        </div>

        {/* Network warning */}
        {!networkStatus.isCorrect && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10 mt-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-400">
              <div className="font-semibold mb-1">Wrong Network Detected</div>
              <div className="text-sm">
                Please switch to {hyperliquid.useTestnet ? "Arbitrum Sepolia testnet (Chain ID: 421614)" : "Arbitrum (Chain ID: 42161)"} for Hyperliquid trading.
                {networkStatus.name && (
                  <span className="block mt-1">
                    Currently connected to: {networkStatus.name} (Chain ID: {chain?.id})
                  </span>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Positions Error */}
        {positionsQuery.error && (
          <Alert className="border-red-500/50 bg-red-500/10 mt-3">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">
              <div className="font-semibold mb-1">Position Data Error</div>
              <div className="text-sm">
                Unable to load position data. This may affect order placement.
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
            Connect your wallet to place real predictions on Hyperliquid {hyperliquid.useTestnet ? "Testnet" : "Mainnet"}
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
              const ready = mounted && authenticationStatus !== 'loading'
              const connected =
                ready &&
                account &&
                chain &&
                (!authenticationStatus ||
                  authenticationStatus === 'authenticated')

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
                          type="button"
                        >
                          <Wallet className="w-5 h-5" />
                          <span>Connect Wallet</span>
                        </button>
                      )
                    }

                    if (chain.unsupported) {
                      return (
                        <button
                          onClick={openChainModal}
                          className="w-full h-12 text-lg font-semibold bg-red-500 hover:bg-red-400 text-white rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
                          type="button"
                        >
                          <AlertTriangle className="w-5 h-5" />
                          <span>Wrong Network</span>
                        </button>
                      )
                    }

                    return null
                  })()}
                </div>
              )
            }}
          </ConnectButton.Custom>

          <div className="text-xs text-slate-500 space-y-1">
            <div>• Arbitrum Sepolia testnet required</div>
            <div>• $10 prediction size per trade</div>
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
              <div className="font-semibold">{hyperliquid.useTestnet ? "Testnet" : "Mainnet"} Trading</div>
              <div className="text-sm">
                This app uses Hyperliquid {hyperliquid.useTestnet ? "testnet" : "mainnet"}. You&apos;ll need to switch to {hyperliquid.useTestnet ? "Arbitrum Sepolia" : "Arbitrum"} to sign transactions.
              </div>
              {hyperliquid.useTestnet && <a
                href="https://app.hyperliquid-testnet.xyz/drip"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-white hover:text-blue-200 underline"
              >
                Get Testnet USDC <ExternalLink className="w-3 h-3 ml-1" />
              </a>}
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </Card>
  )
}