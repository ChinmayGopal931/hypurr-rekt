// src/components/AgentStatus.tsx
import React, { useState, useEffect } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { CheckCircle, Clock, AlertTriangle, Settings, Key } from 'lucide-react'
import { hyperliquidAgent } from '@/service/hyperLiquidAgent'

interface AgentStatusProps {
  userAddress: string | undefined
  isConnected: boolean
}

export function AgentStatus({ userAddress, isConnected }: AgentStatusProps) {
  const [agentStatus, setAgentStatus] = useState<{
    exists: boolean
    approved: boolean
    address?: string
  }>({ exists: false, approved: false })

  useEffect(() => {
    if (userAddress && isConnected) {
      // Check if agent exists
      const agent = hyperliquidAgent.loadAgent(userAddress)
      setAgentStatus({
        exists: !!agent,
        approved: agent?.isApproved || false,
        address: agent?.address
      })
    } else {
      setAgentStatus({ exists: false, approved: false })
    }
  }, [userAddress, isConnected])

  if (!isConnected || !userAddress) {
    return null
  }

  return (
    <Card className="p-4 bg-slate-900/50 border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
            <Key className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-white font-medium text-sm">Trading Agent</span>
              {agentStatus.approved ? (
                <Badge variant="outline" className="text-green-400 border-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Ready
                </Badge>
              ) : agentStatus.exists ? (
                <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                  <Clock className="w-3 h-3 mr-1" />
                  Pending
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-400 border-slate-400">
                  <Settings className="w-3 h-3 mr-1" />
                  Not Setup
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-400">
              {agentStatus.approved ? (
                <span>Agent wallet approved for trading</span>
              ) : agentStatus.exists ? (
                <span>Agent created, approval needed</span>
              ) : (
                <span>Agent will be created on first trade</span>
              )}
            </div>
          </div>
        </div>
        
        {agentStatus.address && (
          <div className="text-xs text-slate-500 font-mono">
            {agentStatus.address.slice(0, 6)}...{agentStatus.address.slice(-4)}
          </div>
        )}
      </div>

      {/* Info about agent system */}
      {!agentStatus.approved && (
        <Alert className="border-blue-500/50 bg-blue-500/10 mt-3">
          <AlertTriangle className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-400">
            <div className="space-y-2">
              <div className="font-semibold text-sm">About Trading Agents</div>
              <div className="text-xs">
                Hyperliquid requires a special "agent wallet" to place orders. 
                When you place your first trade, we'll:
              </div>
              <div className="text-xs space-y-1 ml-2">
                <div>• Generate a secure agent wallet</div>
                <div>• Ask you to approve it (one-time setup)</div>
                <div>• Use it for all future trades</div>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </Card>
  )
}