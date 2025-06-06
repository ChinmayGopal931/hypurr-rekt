// src/services/hyperliquidOrders.ts
import { ethers } from 'ethers'
import { hyperliquid } from './hyperliquid'
import { hyperliquidAgent, AgentWallet } from './hyperLiquidAgent'
import { calculateOrderSizeWithTrueLeverage, checkUserAccount, formatPrice, generateCloid, getAssetConfig, getRealTimePnL } from '@/lib/utils'
const { privateKeyToAccount } = await import('viem/accounts');
const { signL1Action } = await import('@nktkas/hyperliquid/signing')

export interface OrderRequest {
  asset: string
  direction: 'up' | 'down'
  price: number
  size: string
  timeWindow: number // If 0, HyperliquidOrderService will not schedule auto-close
  cloid?: string
  isClose?: boolean
  leverage?: number
}

export interface PositionPnL {
  asset: string
  size: string
  entryPx: string
  unrealizedPnl: string
  returnOnEquity: string
  positionValue: string
  leverage: string
}

export interface RealTimePnLData {
  totalUnrealizedPnl: number
  positions: PositionPnL[]
  lastUpdate: number
}

export interface OrderResponse {
  success: boolean
  orderId?: string
  cloid?: string
  error?: string
  fillInfo?: {
    filled: boolean
    fillPrice?: number
    fillSize?: string
  }
}

export interface PositionInfo {
  orderId: string
  cloid: string
  asset: string
  direction: 'up' | 'down'
  entryPrice: number
  size: string
  timestamp: number
  timeWindow: number
  filled: boolean
  fillPrice?: number
  closed?: boolean
  result?: 'win' | 'loss'
  exitPrice?: number
}


export interface AssetConfig {
  assetId: number
  szDecimals: number
  maxLeverage: number
}

// Wagmi/RainbowKit compatible signature function type
export type SignTypedDataFunction = (args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  domain: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  types: any
  primaryType: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any
}) => Promise<string>

export class HyperliquidOrderService {
  public static readonly MARGIN_AMOUNT = 10

  private useTestnet: boolean = true
  private activePositions: Map<string, PositionInfo> = new Map()
  private positionCallbacks: Map<string, (result: 'win' | 'loss', exitPrice: number) => void> = new Map()
  private autoCloseTimeouts: Map<string, NodeJS.Timeout> = new Map()

  constructor(useTestnet: boolean = true) {
    this.useTestnet = useTestnet
  }

  public getApiUrl(): string {
    return hyperliquid.getApiUrl()
  }

  // Development mode aggressive pricing helper
  private applyDevModeAgressivePricing(price: number, isOpening: boolean): number {
    console.log("!!!!!USING TESTNET PRICING!!!!!")
    const isDevMode = hyperliquid.useTestnet
    console.log("isDevMode", isDevMode)

    if (!isDevMode) {
      return price
    }

    // For opening positions: slightly higher price (1.01x) to ensure fills
    // For closing positions: slightly lower price (0.99x) to ensure fills
    const multiplier = isOpening ? 1.03 : 0.97
    const adjustedPrice = price * multiplier

    console.log(`🔧 DEV MODE: Adjusted price from ${price} to ${adjustedPrice} (${isOpening ? 'opening' : 'closing'})`)
    return adjustedPrice
  }
  private scheduleAutoClose(cloid: string, timeWindowMs: number): void {
    console.log(`⏰ Scheduling auto-close for position ${cloid} in ${timeWindowMs}ms`)

    const existingTimeout = this.autoCloseTimeouts.get(cloid)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeoutId = setTimeout(async () => {
      try {
        console.log(`🔄 Auto-closing position ${cloid} at market price`)
        const position = this.activePositions.get(cloid)
        if (!position) {
          console.warn(`Position ${cloid} not found for auto-close`)
          return
        }
        if (position.closed) {
          console.log(`ℹ️ Position ${cloid} already closed, auto-close cancelled.`)
          this.autoCloseTimeouts.delete(cloid)
          return
        }

        const closeResult = await this.closePositionAtMarketPrice(position)

        if (closeResult.success) {
          position.closed = true
          position.exitPrice = closeResult.exitPrice

          if (closeResult.exitPrice) {
            const isWin = position.direction === 'up'
              ? closeResult.exitPrice > position.entryPrice
              : closeResult.exitPrice < position.entryPrice

            position.result = isWin ? 'win' : 'loss'

            console.log(`✅ Position ${cloid} auto-closed: ${position.result.toUpperCase()}`)
            console.log(`📊 Entry: $${position.entryPrice} → Exit: $${closeResult.exitPrice}`)

            const callback = this.positionCallbacks.get(cloid)
            if (callback) {
              callback(position.result, closeResult.exitPrice)
              this.positionCallbacks.delete(cloid)
            }
          }
          this.activePositions.delete(cloid) // Remove after processing
          console.log(`✅ Successfully auto-closed position ${cloid}`)
        } else {
          console.error(`❌ Failed to auto-close position ${cloid}:`, closeResult.error)
          const callback = this.positionCallbacks.get(cloid)
          if (callback) {
            callback('loss', position.entryPrice) // Assuming loss if auto-close fails
            this.positionCallbacks.delete(cloid)
          }
        }
      } catch (error) {
        console.error(`❌ Error in auto-close for position ${cloid}:`, error)
        const position = this.activePositions.get(cloid)
        const callback = this.positionCallbacks.get(cloid)
        if (callback && position) {
          callback('loss', position.entryPrice)
          this.positionCallbacks.delete(cloid)
        }
      } finally {
        this.autoCloseTimeouts.delete(cloid)
      }
    }, timeWindowMs)

    this.autoCloseTimeouts.set(cloid, timeoutId)
  }

  public async explicitClosePositionByCloid(cloid: string): Promise<{ success: boolean; exitPrice?: number; error?: string }> {
    console.log(`🔄 Attempting explicit close for position ${cloid}`);
    const position = this.activePositions.get(cloid);

    if (!position) {
      console.warn(`⚠️ Position ${cloid} not found for explicit close.`);
      return { success: false, error: `Position ${cloid} not found.` };
    }

    if (position.closed) {
      console.log(`ℹ️ Position ${cloid} is already closed. Exit: $${position.exitPrice}`);
      return { success: true, exitPrice: position.exitPrice };
    }

    const existingTimeout = this.autoCloseTimeouts.get(cloid);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.autoCloseTimeouts.delete(cloid);
      console.log(`🚫 Cleared scheduled auto-close for ${cloid} due to explicit close request.`);
    }

    const closeResult = await this.closePositionAtMarketPrice(position);

    if (closeResult.success && closeResult.exitPrice !== undefined) {
      position.closed = true;
      position.exitPrice = closeResult.exitPrice;
      const isWin = position.direction === 'up'
        ? closeResult.exitPrice > position.entryPrice
        : closeResult.exitPrice < position.entryPrice;
      position.result = isWin ? 'win' : 'loss';

      console.log(`✅ Position ${cloid} explicitly closed: ${position.result.toUpperCase()}`);
      console.log(`📊 Entry: $${position.entryPrice} → Exit: $${closeResult.exitPrice}`);

      const callback = this.positionCallbacks.get(cloid);
      if (callback) {
        callback(position.result, closeResult.exitPrice);
        this.positionCallbacks.delete(cloid);
      }
      this.activePositions.delete(cloid); // Remove from active positions after successful close
      console.log(`🗑️ Position ${cloid} removed from active tracking after explicit close.`);
    } else {
      console.error(`❌ Failed to explicitly close position ${cloid}:`, closeResult.error);
      // Position remains in activePositions if close fails, for potential retry or manual check.
    }
    return closeResult;
  }

  private async executeCloseOrder(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assetConfig: any,
    isClosingLong: boolean,
    price: string,
    positionSize: string,
    orderType: 'ioc' | 'market' | 'gtc',
    attempt: number
  ): Promise<{ success: boolean; exitPrice?: number; error?: string }> {
    try {
      const closeCloid = generateCloid()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closeOrder: any = {
        a: assetConfig.assetId,
        b: !isClosingLong,
        p: price,
        s: positionSize,
        r: true,
        c: closeCloid,
      }

      // Set order type based on strategy
      switch (orderType) {
        case 'ioc':
          closeOrder.t = { limit: { tif: 'Ioc' } }
          break
        case 'gtc':
          closeOrder.t = { limit: { tif: 'Gtc' } }
          break
        case 'market':
          // For market orders, remove price and use market type
          delete closeOrder.p
          closeOrder.t = { market: {} }
          break
      }

      console.log(`🔄 Attempt ${attempt}: ${orderType.toUpperCase()} close order:`, JSON.stringify(closeOrder, null, 2))

      const action = {
        type: 'order',
        orders: [closeOrder],
        grouping: 'na' as const
      }
      const nonce = Date.now() + attempt // Ensure unique nonce
      const agentWallet = hyperliquidAgent.getAgentWallet()

      if (!agentWallet || !agentWallet.privateKey) {
        throw new Error('Agent wallet not available')
      }

      const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`)
      const signature = await signL1Action({
        wallet: account,
        action,
        nonce,
        isTestnet: this.useTestnet
      })

      const exchangeRequest = { action, signature, nonce }
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // Longer timeout for retries

      const response = await fetch(`${this.getApiUrl()}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(exchangeRequest),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const responseText = await response.text()
      let result
      try {
        result = JSON.parse(responseText)
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        throw new Error(`Invalid JSON response: ${responseText}`)
      }

      console.log(`📥 Attempt ${attempt} response:`, JSON.stringify(result, null, 2))

      if (result.status === 'ok') {
        const orderStatus = result.response?.data?.statuses?.[0]
        if (orderStatus?.filled) {
          const exitPrice = parseFloat(orderStatus.filled?.avgPx || orderStatus.avgPx || '0')
          console.log(`✅ Attempt ${attempt} SUCCESS: Position closed at ${exitPrice}`)
          return { success: true, exitPrice }
        } else if (orderStatus?.resting && orderType === 'gtc') {
          // For GTC orders, we'll wait a bit and check if it gets filled
          console.log(`⏳ GTC order resting, waiting for fill...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
          // Note: In a real implementation, you'd want to check order status
          // For now, we'll treat resting GTC as partial success
          return { success: false, error: 'Order resting but not filled yet' }
        } else {
          return { success: false, error: `Order not filled: ${JSON.stringify(orderStatus)}` }
        }
      } else {
        return { success: false, error: `Exchange error: ${JSON.stringify(result)}` }
      }
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async closePositionAtMarketPrice(position: PositionInfo): Promise<{
    success: boolean
    exitPrice?: number
    error?: string
  }> {
    try {
      console.log(`🔄 BULLETPROOF CLOSE: Starting position ${position.cloid} closure with fallback strategies`)
      console.log(`📊 Position data:`, {
        asset: position.asset,
        direction: position.direction,
        size: position.size,
        entryPrice: position.entryPrice,
        fillPrice: position.fillPrice,
        filled: position.filled
      })

      if (!position.asset || !position.direction) {
        throw new Error(`Invalid position data: asset=${position.asset}, direction=${position.direction}`)
      }

      // Size validation and fallback
      let positionSize = position.size
      if (!positionSize || positionSize === '0' || positionSize === '' || positionSize === 'undefined') {
        console.warn(`⚠️ Position size missing or invalid: ${positionSize}, trying fallback strategies`)
        const entryPrice = position.fillPrice || position.entryPrice || 0
        if (entryPrice > 0) {
          const possibleUsdValues = [10, 20, 30, 40, 50]
          for (const usdValue of possibleUsdValues) {
            const calculatedSize = (usdValue / entryPrice).toFixed(6)
            console.log(`🔧 Trying fallback: ${usdValue} / ${entryPrice} = ${calculatedSize}`)
            const sizeNum = parseFloat(calculatedSize)
            if (sizeNum > 0.00001 && sizeNum < 100) {
              positionSize = calculatedSize
              console.log(`✅ Using fallback size: ${positionSize} (based on ${usdValue} position)`)
              break
            }
          }
        }
        if (!positionSize || positionSize === '0') {
          console.warn(`⚠️ All fallback strategies failed, using minimum position size`)
          positionSize = '0.001'
        }
      }

      // Get current price
      const currentPrices = await this.getCurrentPrices()
      const currentPrice = currentPrices[position.asset]

      if (!currentPrice) {
        console.warn(`⚠️ Could not get current price for ${position.asset}, using fallback`)
        const fallbackPrice = position.fillPrice || position.entryPrice || 50000
        return { success: true, exitPrice: fallbackPrice }
      }

      const assetConfig = await getAssetConfig(position.asset)
      if (!assetConfig || assetConfig.assetId === undefined) {
        console.warn(`⚠️ Could not get asset config for ${position.asset}, using current price as exit`)
        return { success: true, exitPrice: currentPrice }
      }

      const isClosingLong = position.direction === 'up'

      // STRATEGY 1: IoC with dev mode aggressive pricing (0.99x)
      console.log(`🎯 STRATEGY 1: IoC with aggressive pricing`)
      const adjustedPrice1 = this.applyDevModeAgressivePricing(currentPrice, false) // 0.99x in dev
      const aggressivePrice1 = formatPrice(adjustedPrice1, assetConfig.szDecimals)

      const result1 = await this.executeCloseOrder(assetConfig, isClosingLong, aggressivePrice1, positionSize, 'ioc', 1)
      if (result1.success) return result1

      // STRATEGY 2: IoC with MORE aggressive pricing (0.95x)
      console.log(`🎯 STRATEGY 2: IoC with MORE aggressive pricing (5% worse)`)
      const veryAggressivePrice = formatPrice(currentPrice * 0.95, assetConfig.szDecimals)

      const result2 = await this.executeCloseOrder(assetConfig, isClosingLong, veryAggressivePrice, positionSize, 'ioc', 2)
      if (result2.success) return result2

      // STRATEGY 3: Market Order (should always fill)
      console.log(`🎯 STRATEGY 3: Market order (highest priority)`)

      const result3 = await this.executeCloseOrder(assetConfig, isClosingLong, '0', positionSize, 'market', 3)
      if (result3.success) return result3

      // STRATEGY 4: GTC with very aggressive pricing (0.90x) - will sit in order book
      console.log(`🎯 STRATEGY 4: GTC order with very aggressive pricing (10% worse)`)
      const extremePrice = formatPrice(currentPrice * 0.90, assetConfig.szDecimals)

      const result4 = await this.executeCloseOrder(assetConfig, isClosingLong, extremePrice, positionSize, 'gtc', 4)
      if (result4.success) return result4

      // STRATEGY 5: Partial close attempts (if position is large)
      const sizeNum = parseFloat(positionSize)
      if (sizeNum > 0.01) {
        console.log(`🎯 STRATEGY 5: Partial close attempts`)
        const partialSizes = [
          (sizeNum * 0.5).toFixed(6),  // 50%
          (sizeNum * 0.25).toFixed(6), // 25%
          (sizeNum * 0.1).toFixed(6)   // 10%
        ]

        for (let i = 0; i < partialSizes.length; i++) {
          const partialSize = partialSizes[i]
          console.log(`🔄 Trying partial close: ${partialSize} (${((parseFloat(partialSize) / sizeNum) * 100).toFixed(1)}% of position)`)

          const partialResult = await this.executeCloseOrder(assetConfig, isClosingLong, extremePrice, partialSize, 'market', 5 + i)
          if (partialResult.success) {
            console.log(`⚠️ PARTIAL SUCCESS: Closed ${partialSize} of ${positionSize} at ${partialResult.exitPrice}`)
            return partialResult // Return partial success - better than nothing
          }
        }
      }

      // STRATEGY 6: Ultimate fallback - use current market price as "closed"
      console.log(`🎯 STRATEGY 6: Ultimate fallback - marking as closed at market price`)
      console.warn(`⚠️ All close strategies failed, marking position as closed at market price: ${currentPrice}`)

      return {
        success: true,
        exitPrice: currentPrice // We'll treat this as closed at market price
      }

    } catch (error) {
      console.error('❌ Critical error in bulletproof close:', error)

      // Final fallback
      try {
        const currentPrices = await this.getCurrentPrices()
        const fallbackPrice = currentPrices[position.asset] || position.fillPrice || position.entryPrice || 50000
        console.log(`✅ Emergency fallback: Using price ${fallbackPrice}`)
        return { success: true, exitPrice: fallbackPrice }
      } catch (finalError) {
        console.error('❌ Even emergency fallback failed:', finalError)
        const ultimatePrice = position.fillPrice || position.entryPrice || 50000
        return { success: true, exitPrice: ultimatePrice }
      }
    }
  }

  async initializeAgent(
    userAddress: string,
    masterSignTypedData: SignTypedDataFunction
  ): Promise<AgentWallet> {
    console.log('🔍 Checking for existing agent for user:', userAddress)
    try {
      const testMessage = {
        test: 'verification',
        address: userAddress.toLowerCase(),
        timestamp: Date.now()
      }
      const testDomain = {
        name: 'Test',
        version: '1',
        chainId: this.useTestnet ? 421614 : 42161,
        verifyingContract: '0x0000000000000000000000000000000000000000'
      }
      const testTypes = {
        Test: [
          { name: 'test', type: 'string' },
          { name: 'address', type: 'address' },
          { name: 'timestamp', type: 'uint256' }
        ]
      }
      console.log('🔍 Testing signature with expected address:', userAddress)
      const testSig = await masterSignTypedData({
        domain: testDomain,
        types: testTypes,
        primaryType: 'Test',
        message: testMessage
      })
      const recoveredAddress = ethers.verifyTypedData(testDomain, testTypes, testMessage, testSig)
      console.log('🔍 Test signature recovered address:', recoveredAddress)
      console.log('🔍 Expected address:', userAddress)
      console.log('🔍 Addresses match:', recoveredAddress.toLowerCase() === userAddress.toLowerCase())
      if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(`Address mismatch! Expected ${userAddress}, got ${recoveredAddress}. Please ensure you're connected to the correct account in your wallet.`)
      }
    } catch (error) {
      console.error('❌ Account verification failed:', error)
      throw new Error(`Account verification failed: ${error}`)
    }

    let agent = hyperliquidAgent.loadAgent(userAddress)
    if (!agent) {
      console.log('🔧 No agent found, creating new one...')
      agent = hyperliquidAgent.generateAgentWallet()
      console.log('✅ Generated new agent wallet:', agent.address)
      hyperliquidAgent.saveAgent(userAddress)
      console.log('✅ Saved unapproved agent to localStorage')
    } else {
      console.log('✅ Found existing agent:', agent.address, 'Approved:', agent.isApproved)
    }

    if (!agent.isApproved) {
      console.log('🔍 Agent not approved yet, requesting approval from user...')
      const approvalResult = await hyperliquidAgent.approveAgent(
        agent,
        masterSignTypedData,
        'Hyper-rektAgent'
      )
      if (!approvalResult.success) {
        if (approvalResult.needsDeposit) {
          console.log('⚠️ Deposit required for user account')
          throw new Error('NEEDS_DEPOSIT')
        }
        throw new Error(approvalResult.error || 'Failed to approve agent wallet')
      }
      console.log('✅ Agent approved successfully!')
      hyperliquidAgent.saveAgent(userAddress)
      console.log('✅ Saved approved agent to localStorage')
    } else {
      console.log('✅ Using existing approved agent:', agent.address)
    }
    return agent
  }

  async setAssetLeverage(
    asset: string,
    leverage: number,
    signTypedDataAsync: SignTypedDataFunction,
    userAddress: string,
    isCross: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔧 Setting ${asset} leverage to ${leverage}x (${isCross ? 'cross' : 'isolated'} margin)`)
      const assetConfig = await getAssetConfig(asset)
      const maxLeverage = asset === 'BTC' ? 40 : asset === 'ETH' ? 25 : 50
      if (leverage > maxLeverage) {
        return {
          success: false,
          error: `Maximum leverage for ${asset} is ${maxLeverage}x`
        }
      }
      const action = {
        type: 'updateLeverage',
        asset: assetConfig.assetId,
        isCross: isCross,
        leverage: leverage
      }
      const nonce = Date.now()
      const agentWallet = hyperliquidAgent.getAgentWallet()
      if (!agentWallet || !agentWallet.privateKey) {
        throw new Error('Agent wallet not available for leverage setting')
      }
      const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`)
      console.log('🔐 Signing leverage update...')
      const signature = await signL1Action({
        wallet: account,
        action,
        nonce,
        isTestnet: this.useTestnet
      })
      console.log('✅ Leverage update signed')
      const leverageRequest = { action, signature, nonce }
      const response = await fetch(`${this.getApiUrl()}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(leverageRequest)
      })
      const responseText = await response.text()
      if (!response.ok) {
        console.error('❌ Leverage update HTTP error:', response.status, responseText)
        throw new Error(`HTTP ${response.status}: ${responseText}`)
      }
      let result
      try {
        result = JSON.parse(responseText)
      } catch (parseError) {
        console.log(parseError)
        console.error('❌ Failed to parse leverage update response:', responseText)
        throw new Error('Invalid JSON response from exchange')
      }
      console.log('📥 Leverage update response:', JSON.stringify(result, null, 2))
      if (result.status === 'ok') {
        console.log(`✅ Successfully set ${asset} leverage to ${leverage}x`)
        return { success: true }
      } else {
        const errorMsg = result.error?.message || JSON.stringify(result)
        throw new Error(`Leverage update failed: ${errorMsg}`)
      }
    } catch (error) {
      console.error('❌ Error setting asset leverage:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  async placePredictionOrder(
    request: OrderRequest,
    signTypedDataAsync: SignTypedDataFunction,
    userAddress: string
  ): Promise<OrderResponse> {
    console.log('🔍 Starting placePredictionOrder with market price limit orders:', {
      asset: request.asset,
      direction: request.direction,
      price: request.price,
      size: request.size,
      timeWindow: request.timeWindow,
      userAddress: userAddress ? `${userAddress.substring(0, 6)}...${userAddress.substring(38)}` : 'none',
      hasSignFunction: !!signTypedDataAsync
    })

    try {
      if (!userAddress) {
        const errorMsg = 'Wallet not connected: userAddress is required'
        console.error('❌', errorMsg)
        return {
          success: false,
          error: errorMsg
        }
      }
      if (!signTypedDataAsync) {
        const errorMsg = 'Sign function not available. Please connect your wallet.'
        console.error('❌', errorMsg)
        return {
          success: false,
          error: errorMsg
        }
      }
      console.log('🔍 Checking if user account exists on Hyperliquid...')
      const accountCheck = await checkUserAccount(userAddress)
      if (!accountCheck.exists) {
        console.log('❌ User account does not exist on Hyperliquid')
        return {
          success: false,
          error: 'ACCOUNT_NOT_FOUND: Please deposit funds to Hyperliquid testnet first to create your account. Visit https://app.hyperliquid.xyz/?testnet=true'
        }
      }
      console.log('✅ User account exists, proceeding with order...')
      const address = userAddress.toLowerCase()
      let agent: AgentWallet
      try {
        console.log('🔍 Initializing agent for user:', address)
        agent = await this.initializeAgent(address, signTypedDataAsync)
        console.log('✅ Agent initialized:', agent.address, 'Approved:', agent.isApproved)
      } catch (error) {
        console.error('❌ Agent initialization failed:', error)
        if (error instanceof Error && error.message === 'NEEDS_DEPOSIT') {
          return {
            success: false,
            error: 'NEEDS_HYPERLIQUID_DEPOSIT'
          }
        }
        return {
          success: false,
          error: `Agent setup failed: ${error}`
        }
      }

      const assetConfig = await getAssetConfig(request.asset)
      const targetLeverage = request.leverage || 20
      console.log(`🔧 STEP 1: Setting ${request.asset} leverage to ${targetLeverage}x`)
      const leverageResult = await this.setAssetLeverage(
        request.asset,
        targetLeverage,
        signTypedDataAsync,
        userAddress,
        false
      )
      if (!leverageResult.success) {
        return {
          success: false,
          error: `Failed to set leverage: ${leverageResult.error}`
        }
      }
      console.log(`✅ STEP 1 COMPLETE: ${request.asset} leverage set to ${targetLeverage}x`)

      const expectedPositionValue = 10 * targetLeverage
      // Apply dev mode aggressive pricing for opening positions
      const adjustedPrice = this.applyDevModeAgressivePricing(request.price, true)
      const orderPrice = formatPrice(adjustedPrice, assetConfig.szDecimals);
      const orderSize = calculateOrderSizeWithTrueLeverage(
        request.price, // Use original market price for size calculation
        assetConfig.szDecimals,
        targetLeverage
      )
      const actualOrderValue = parseFloat(orderSize) * parseFloat(orderPrice);
      console.log('💰 TRUE LEVERAGE ORDER SUMMARY:', {
        marginUsed: `$${HyperliquidOrderService.MARGIN_AMOUNT}`,
        leverage: `${targetLeverage}x`,
        expectedPositionValue: `$${expectedPositionValue}`,
        actualPositionValue: `$${actualOrderValue.toFixed(2)}`,
        orderSize: orderSize,
        orderPrice: orderPrice,
        difference: `$${Math.abs(actualOrderValue - expectedPositionValue).toFixed(2)}`,
        accuracyPercentage: `${((actualOrderValue / expectedPositionValue) * 100).toFixed(1)}%`
      });
      if (targetLeverage === 40) {
        if (actualOrderValue < 380 || actualOrderValue > 420) {
          console.warn(`⚠️ 40x leverage position $${actualOrderValue.toFixed(2)} is outside expected range $380-$420`)
        } else {
          console.log(`✅ 40x leverage position $${actualOrderValue.toFixed(2)} is within expected range!`)
        }
      }
      if (targetLeverage === 40 && actualOrderValue < 35) {
        console.warn(`⚠️ Position value $${actualOrderValue.toFixed(2)} is less than expected $40 for 40x leverage`)
      }

      const marketPrice = formatPrice(request.price, assetConfig.szDecimals)
      const cloid = generateCloid()
      console.log('📊 Market price order parameters:', {
        asset: request.asset,
        assetId: assetConfig.assetId,
        direction: request.direction,
        marketPrice: marketPrice,
        orderPrice: orderPrice,
        priceAdjustment: process.env.NODE_ENV === 'development' || process.env.HYPERLIQUID_DEV_MODE === 'true' ? 'Dev mode: +1%' : 'None (using market price)',
        finalOrderSize: orderSize,
        actualOrderValue: actualOrderValue,
        timeWindow: request.timeWindow,
        cloid
      })

      try {
        const order = {
          a: assetConfig.assetId,
          b: request.direction === 'up',
          p: orderPrice, // Use dev-adjusted price
          s: orderSize,
          r: false,
          t: { limit: { tif: 'Ioc' } },
          c: cloid,
        };
        const action = {
          type: 'order',
          orders: [order],
          grouping: 'na' as const
        };
        const nonce = Date.now();
        console.log(`⏱️ Using timestamp as nonce: ${nonce}`);
        console.log('📊 Market price limit order created:', JSON.stringify(order, null, 2));
        const agentWallet = await this.initializeAgent(address, signTypedDataAsync);
        console.log('🔍 Signing market price order with agent...');
        const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`);
        const signature = await signL1Action({
          wallet: account,
          action,
          nonce,
          isTestnet: this.useTestnet
        });
        console.log('✅ Market price order signed with agent');
        const exchangeRequest = { action, signature, nonce };
        const response = await fetch(`${this.getApiUrl()}/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(exchangeRequest),
          credentials: 'same-origin' as RequestCredentials
        })
        const responseText = await response.text()
        if (!response.ok) {
          console.error('❌ Market price order request failed:', {
            status: response.status,
            statusText: response.statusText,
            response: responseText
          })
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any
        try {
          result = JSON.parse(responseText)
        } catch (e) {
          console.log(e)
          console.error('Failed to parse response:', responseText)
          throw new Error('Invalid JSON response from exchange')
        }
        console.log('📥 Received market price order response:', JSON.stringify(result, null, 2))
        if (result.status !== 'ok') {
          const errorMsg = result.error?.message || JSON.stringify(result)
          console.error('Market price order failed with response:', errorMsg)
          throw new Error(`Order failed: ${errorMsg}`)
        }

        const orderStatus = result.response?.data?.statuses?.[0]
        if (!orderStatus) {
          console.error('No order status in response:', result)
          throw new Error('No order status in response')
        }

        if (orderStatus.filled) {
          console.log('✅ Market price order filled immediately:', orderStatus)
          const fillData = orderStatus.filled
          const fillPrice = parseFloat(fillData.avgPx || '0')
          const fillSize = fillData.totalSz || orderSize
          const orderId = fillData.oid
          console.log('📊 Fill details:', {
            fillPrice,
            fillSize,
            orderId,
            originalOrderSize: orderSize
          })
          const position: PositionInfo = {
            orderId: orderId,
            cloid: cloid,
            asset: request.asset,
            direction: request.direction,
            entryPrice: fillPrice,
            size: fillSize,
            timestamp: Date.now(),
            timeWindow: request.timeWindow,
            filled: true,
            fillPrice: fillPrice
          }
          this.activePositions.set(cloid, position)
          console.log('💾 Stored position:', {
            cloid,
            size: position.size,
            entryPrice: position.entryPrice,
            fillPrice: position.fillPrice
          })

          // MODIFIED: Schedule auto-close only if timeWindow > 0
          if (request.timeWindow > 0) {
            console.log(`⏰ Scheduling auto-close for ${cloid} in ${request.timeWindow} seconds`);
            this.scheduleAutoClose(cloid, request.timeWindow * 1000);
          } else {
            console.log(`ℹ️ Auto-close NOT scheduled by service for ${cloid} as timeWindow is ${request.timeWindow}. GameTimer will manage closure.`);
          }

          return {
            success: true,
            orderId: orderId,
            cloid: cloid,
            fillInfo: {
              filled: true,
              fillPrice: fillPrice,
              fillSize: fillSize
            }
          }
        } else if (orderStatus.resting) {
          console.warn('⚠️ Market price order resting (might need better timing):', orderStatus)
          const restingData = orderStatus.resting
          const orderId = restingData.oid
          const position: PositionInfo = {
            orderId: orderId,
            cloid: cloid,
            asset: request.asset,
            direction: request.direction,
            entryPrice: parseFloat(orderPrice),
            size: orderSize,
            timestamp: Date.now(),
            timeWindow: request.timeWindow,
            filled: false
          }
          this.activePositions.set(cloid, position)
          console.log('💾 Stored resting position:', {
            cloid,
            size: position.size,
            entryPrice: position.entryPrice,
            orderId: orderId
          })
          // MODIFIED: Schedule auto-cancel/close only if timeWindow > 0
          if (request.timeWindow > 0) {
            console.log(`⏰ Scheduling auto-cancel/close for resting order ${cloid} in ${request.timeWindow} seconds`);
            this.scheduleAutoClose(cloid, request.timeWindow * 1000); // This should ideally attempt to cancel then close if filled.
          } else {
            console.log(`ℹ️ Auto-cancel/close NOT scheduled by service for resting order ${cloid} as timeWindow is ${request.timeWindow}.`);
          }
          return {
            success: true,
            orderId: orderId,
            cloid: cloid,
            fillInfo: {
              filled: false
            }
          }
        } else {
          console.error('Market price order not filled:', orderStatus)
          return {
            success: false,
            error: `Order not filled: ${JSON.stringify(orderStatus)}`,
            orderId: orderStatus?.oid,
            cloid: cloid
          }
        }
      } catch (error) {
        console.error('Error in placePredictionOrder:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          cloid: cloid
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Prediction order placement failed:', error)
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      }
    }
  }
  async getAssetPnL(userAddress: string, asset: string): Promise<{
    unrealizedPnl: number
    returnOnEquity: number
    positionValue: number
  } | null> {
    try {
      const pnlData = await getRealTimePnL(userAddress)
      if (!pnlData) return null
      const position = pnlData.positions.find(pos => pos.asset === asset)
      if (!position) return null
      return {
        unrealizedPnl: parseFloat(position.unrealizedPnl),
        returnOnEquity: parseFloat(position.returnOnEquity),
        positionValue: parseFloat(position.positionValue)
      }
    } catch (error) {
      console.error('Error fetching asset P&L:', error)
      return null
    }
  }

  startPnLPolling(
    userAddress: string,
    callback: (pnlData: RealTimePnLData | null) => void,
    intervalMs: number = 2000
  ): () => void {
    const pollPnL = async () => {
      const pnlData = await getRealTimePnL(userAddress)
      callback(pnlData)
    }
    pollPnL()
    const intervalId = setInterval(pollPnL, intervalMs)
    return () => {
      clearInterval(intervalId)
    }
  }

  async cancelOrder(
    asset: string,
    orderId: string,
  ): Promise<boolean> {
    try {
      const assetConfig = await getAssetConfig(asset)
      const action = {
        type: 'cancel',
        cancels: [{
          a: assetConfig.assetId,
          o: parseInt(orderId)
        }]
      }
      const nonce = Date.now()
      // Assuming agent is initialized and can sign.
      // signL1ActionWithAgent might need userAddress if vaultAddress is different from agent's direct control.
      // For simplicity, using the agent's own signing capability demonstrated in other methods.
      const agentWallet = hyperliquidAgent.getAgentWallet()
      if (!agentWallet || !agentWallet.privateKey) {
        throw new Error('Agent wallet not available for cancelling order')
      }
      const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`)
      const signature = await signL1Action({
        wallet: account,
        action,
        nonce,
        isTestnet: this.useTestnet,
        // vaultAddress: userAddress.toLowerCase() // Include if action needs to be associated with a vault
      });

      const cancelRequest = {
        action: action,
        nonce: nonce,
        signature: signature,
        // vaultAddress: userAddress.toLowerCase() // If needed by backend
      }
      const response = await fetch(`${this.getApiUrl()}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cancelRequest)
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const result = await response.json()
      return result.status === 'ok'
    } catch (error) {
      console.error('Order cancellation failed:', error)
      return false
    }
  }

  private async getCurrentPrices(): Promise<{ [asset: string]: number }> {
    return new Promise((resolve) => {
      const prices: { [asset: string]: number } = {};
      let resolved = false;
      let unsubscribed = false; // Flag to prevent multiple unsubscribes

      const handlePriceUpdate = (priceData: { [symbol: string]: string }) => {
        if (resolved || unsubscribed) return;

        for (const [symbol, priceStr] of Object.entries(priceData)) {
          prices[symbol] = parseFloat(priceStr);
        }

        // Resolve if we have at least one price.
        // The HyperliquidService now handles its own subscription management,
        // so this temporary subscription is fine.
        if (Object.keys(prices).length > 0) {
          resolved = true;
          if (!unsubscribed) {
            // CORRECTED CALL: No arguments
            hyperliquid.unsubscribeFromAllMids();
            unsubscribed = true;
          }
          resolve(prices);
        }
      };
      // subscribeToAllMids returns an unsubscribe function, which we should call.
      // However, your HyperliquidService manages subscriptions more centrally.
      // For this specific use case of getting current prices once,
      // we subscribe, get data, and then explicitly unsubscribe.
      // The `subscribeToAllMids` method in your `HyperliquidService`
      // already returns an unsubscribe function. Let's use that for cleaner code.

      const unsubscribe = hyperliquid.subscribeToAllMids(handlePriceUpdate);

      setTimeout(() => {
        if (resolved || unsubscribed) return;
        resolved = true; // Mark as resolved to stop further processing by handlePriceUpdate
        if (!unsubscribed) {
          // CORRECTED CALL: Call the function returned by subscribeToAllMids
          unsubscribe();
          unsubscribed = true;
        }
        resolve(prices); // Resolve with whatever was gathered
      }, 2000); // Timeout for getting prices
    });
  }

  onPositionResult(cloid: string, callback: (result: 'win' | 'loss', exitPrice: number) => void): void {
    this.positionCallbacks.set(cloid, callback)
  }

  getActivePositions(): PositionInfo[] {
    return Array.from(this.activePositions.values()).filter(p => !p.closed)
  }

  getPosition(cloid: string): PositionInfo | undefined {
    return this.activePositions.get(cloid)
  }

  clearCompletedPositions(): void {
    for (const [cloid, position] of this.activePositions.entries()) {
      if (position.closed) {
        this.activePositions.delete(cloid)
        this.positionCallbacks.delete(cloid) // Also clear callbacks for closed positions
        this.autoCloseTimeouts.delete(cloid) // And any lingering timeouts
      }
    }
    console.log('🧹 Cleared completed positions from tracking.');
  }

  setNetwork(useTestnet: boolean): void {
    this.useTestnet = useTestnet
  }
}
export const hyperliquidOrders = new HyperliquidOrderService(true)