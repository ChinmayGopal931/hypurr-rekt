// src/components/DepositRequiredAlert.tsx
import React from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { ExternalLink, DollarSign, AlertTriangle, Copy } from 'lucide-react'

interface DepositRequiredAlertProps {
  userAddress: string
  onDismiss: () => void
}

export function DepositRequiredAlert({ userAddress, onDismiss }: DepositRequiredAlertProps) {
  const handleOpenHyperliquid = () => {
    window.open('https://app.hyperliquid-testnet.xyz', '_blank')
  }

  const handleGetTestnetEth = () => {
    window.open('https://faucet.arbitrum.io/', '_blank')
  }

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(userAddress)
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy address:', error)
    }
  }

  return (
    <Alert className="border-yellow-500/50 bg-yellow-500/10">
      <AlertTriangle className="h-4 w-4 text-yellow-400" />
      <AlertDescription className="text-yellow-400">
        <div className="space-y-4">
          <div>
            <div className="font-semibold mb-2">Deposit Required</div>
            <div className="text-sm">
              You need to deposit funds to YOUR wallet address on Hyperliquid Testnet 
              before you can approve the trading agent. This is a one-time requirement.
            </div>
          </div>

          {/* Important: Show the correct address to deposit to */}
          <div className="bg-yellow-500/20 p-3 rounded border border-yellow-500/30">
            <div className="font-medium text-sm mb-2">⚠️ IMPORTANT: Deposit to YOUR wallet address</div>
            <div className="text-xs mb-2">Your wallet address (where you need to deposit):</div>
            <div className="flex items-center space-x-2 bg-black/20 p-2 rounded font-mono text-xs">
              <span className="break-all">{userAddress}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyAddress}
                className="h-6 w-6 p-0"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-xs mt-2 opacity-75">
              📝 Do NOT deposit to the agent wallet address - deposit to THIS address above
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Setup Steps:</div>
            
            <div className="space-y-2 ml-2">
              <div className="flex items-center justify-between bg-yellow-500/20 p-3 rounded">
                <div>
                  <div className="font-medium text-xs">Step 1: Get Testnet ETH</div>
                  <div className="text-xs opacity-75">Free testnet ETH from Arbitrum faucet</div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleGetTestnetEth}
                  className="text-yellow-400 border-yellow-400 hover:bg-yellow-400/10"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Get ETH
                </Button>
              </div>

              <div className="flex items-center justify-between bg-yellow-500/20 p-3 rounded">
                <div>
                  <div className="font-medium text-xs">Step 2: Deposit to Hyperliquid</div>
                  <div className="text-xs opacity-75">Use YOUR wallet address above (any amount)</div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleOpenHyperliquid}
                  className="text-yellow-400 border-yellow-400 hover:bg-yellow-400/10"
                >
                  <DollarSign className="w-3 h-3 mr-1" />
                  Deposit
                </Button>
              </div>
            </div>

            <div className="text-xs opacity-75 border-t border-yellow-500/30 pt-3">
              💡 <strong>Key Point:</strong> The deposit must be to YOUR wallet address shown above, 
              not the agent wallet. The agent is just for signing orders - your main wallet 
              is your trading account.
            </div>
          </div>

          <div className="flex justify-end">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onDismiss}
              className="text-yellow-400 hover:bg-yellow-400/10"
            >
              I understand
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}