// src/components/DepositRequiredAlert.tsx
import React from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { ExternalLink, DollarSign, AlertTriangle } from 'lucide-react'

interface DepositRequiredAlertProps {
  onDismiss: () => void
}

export function DepositRequiredAlert({ onDismiss }: DepositRequiredAlertProps) {
  const handleOpenHyperliquid = () => {
    window.open('https://app.hyperliquid-testnet.xyz', '_blank')
  }

  const handleGetTestnetEth = () => {
    window.open('https://faucet.arbitrum.io/', '_blank')
  }

  return (
    <Alert className="border-yellow-500/50 bg-yellow-500/10">
      <AlertTriangle className="h-4 w-4 text-yellow-400" />
      <AlertDescription className="text-yellow-400">
        <div className="space-y-4">
          <div>
            <div className="font-semibold mb-2">Deposit Required</div>
            <div className="text-sm">
              You need to deposit funds to Hyperliquid Testnet before you can trade. 
              This is a one-time requirement to activate your account.
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Quick Setup (2 steps):</div>
            
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
                  <div className="text-xs opacity-75">Deposit any amount (even $1 worth)</div>
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
              💡 <strong>Tip:</strong> After depositing, come back and try placing a trade again. 
              The agent approval will work once your account is funded.
            </div>
          </div>

          <div className="flex justify-end">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onDismiss}
              className="text-yellow-400 hover:bg-yellow-400/10"
            >
              I'll do this later
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}