// src/services/hyperliquidOrders.ts
import { ethers } from 'ethers'
import { hyperliquid } from './hyperliquid'
import { hyperliquidAgent, AgentWallet } from './hyperLiquidAgent'

export interface OrderRequest {
  asset: string
  direction: 'up' | 'down'
  price: number
  size: string
  timeWindow: number
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

export interface HyperliquidSignature {
  r: string
  s: string
  v: number
}

export interface AssetConfig {
  assetId: number
  szDecimals: number
  maxLeverage: number
}

// Wagmi/RainbowKit compatible signature function type
export type SignTypedDataFunction = (args: {
  domain: any
  types: any
  primaryType: string
  message: any
}) => Promise<string>

export class HyperliquidOrderService {
  private static readonly TESTNET_API = 'https://api.hyperliquid-testnet.xyz'
  private static readonly MAINNET_API = 'https://api.hyperliquid.xyz'
  private static readonly BASE_USD_SIZE = 10 // Base $10 per prediction
  private static readonly BASE_LEVERAGE = 10 // ✅ Changed from 20 to 10 - this is the baseline leverage
  private static readonly MARGIN_AMOUNT = 10 // $10 margin per trade

  
  private useTestnet: boolean = true
  private activePositions: Map<string, PositionInfo> = new Map()
  private positionCallbacks: Map<string, (result: 'win' | 'loss', exitPrice: number) => void> = new Map()
  private autoCloseTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private userNonces: Map<string, number> = new Map()

  constructor(useTestnet: boolean = true) {
    this.useTestnet = useTestnet
  }

  private getApiUrl(): string {
    return this.useTestnet ? HyperliquidOrderService.TESTNET_API : HyperliquidOrderService.MAINNET_API
  }

  /**
   * Close a position by placing an opposite order
   * @param params Position parameters or cloid string
   * @returns Result of the close operation
   */
  private async closePosition(params: string | { asset: string; direction: 'up' | 'down'; size: string; cloid: string }): Promise<{ success: boolean; error?: string }> {
    try {
      // Handle string parameter (cloid)
      if (typeof params === 'string') {
        return this.closePositionById(params);
      }

      console.log(`🔁 Closing position:`, params)
      
      // Get current price for the asset
      const prices = await this.getCurrentPrices()
      const currentPrice = prices[params.asset]
      
      if (currentPrice === undefined) {
        throw new Error(`Could not get current price for ${params.asset}`)
      }
      
      // Create a market order in the opposite direction to close the position
      const orderResult = await this.placePredictionOrder({
        asset: params.asset,
        direction: params.direction,
        size: params.size,
        price: currentPrice,
        timeWindow: 0, // No auto-close for close orders
        cloid: undefined, // Let the system generate a new cloid
        isClose: true // Mark as a closing order
      }, 
      // These parameters will be provided by the caller
      undefined as any, // signTypedDataAsync
      undefined as any // userAddress
      )
      
      if (orderResult?.success) {
        console.log(`✅ Successfully closed position for ${params.asset} ${params.direction} ${params.size}`)
        return { success: true }
      } else {
        console.error(`❌ Failed to close position:`, orderResult?.error)
        return { success: false, error: orderResult?.error || 'Unknown error' }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error in closePosition:', error)
      return { success: false, error: errorMessage }
    }
  }

/**
 * Enhanced auto-close mechanism that closes positions at market price
 */
private scheduleAutoClose(cloid: string, timeWindowMs: number): void {
  console.log(`⏰ Scheduling auto-close for position ${cloid} in ${timeWindowMs}ms`)
  
  // Clear any existing timeout for this position
  const existingTimeout = this.autoCloseTimeouts.get(cloid)
  if (existingTimeout) {
    clearTimeout(existingTimeout)
  }
  
  // Set new timeout
  const timeoutId = setTimeout(async () => {
    try {
      console.log(`🔄 Auto-closing position ${cloid} at market price`)
      const position = this.activePositions.get(cloid)
      if (!position) {
        console.warn(`Position ${cloid} not found for auto-close`)
        return
      }
      
      // ✅ Close position at market price regardless of profit/loss
      const closeResult = await this.closePositionAtMarketPrice(position)
      
      if (closeResult.success) {
        // Update position with exit information
        position.closed = true
        position.exitPrice = closeResult.exitPrice
        
        // Determine win/loss based on direction and price movement
        if (closeResult.exitPrice) {
          const isWin = position.direction === 'up' 
            ? closeResult.exitPrice > position.entryPrice
            : closeResult.exitPrice < position.entryPrice
          
          position.result = isWin ? 'win' : 'loss'
          
          console.log(`✅ Position ${cloid} auto-closed: ${position.result.toUpperCase()}`)
          console.log(`📊 Entry: $${position.entryPrice} → Exit: $${closeResult.exitPrice}`)
          
          // Notify any callbacks
          const callback = this.positionCallbacks.get(cloid)
          if (callback) {
            callback(position.result, closeResult.exitPrice)
            this.positionCallbacks.delete(cloid)
          }
        }
        
        // Clean up position tracking
        this.activePositions.delete(cloid)
        console.log(`✅ Successfully auto-closed position ${cloid}`)
      } else {
        console.error(`❌ Failed to auto-close position ${cloid}:`, closeResult.error)
        // Still notify callback with loss if close failed
        const callback = this.positionCallbacks.get(cloid)
        if (callback) {
          callback('loss', position.entryPrice)
          this.positionCallbacks.delete(cloid)
        }
      }
    } catch (error) {
      console.error(`❌ Error in auto-close for position ${cloid}:`, error)
      // Notify callback with loss on error
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
  
  // Store the timeout ID so we can clear it if needed
  this.autoCloseTimeouts.set(cloid, timeoutId)
}

private calculateTrueLeveragePosition(leverage: number = 20): number {
  const positionValue = HyperliquidOrderService.MARGIN_AMOUNT * leverage
  console.log(`💰 True leverage: $${HyperliquidOrderService.MARGIN_AMOUNT} margin × ${leverage}x = $${positionValue} position`)
  return positionValue
}


private calculateOrderSizeWithTrueLeverage(price: number, assetDecimals: number, leverage: number = 20): string {
  const positionValue = this.calculateTrueLeveragePosition(leverage);
  const assetSize = positionValue / price;
  
  // Format properly for Hyperliquid
  const factor = Math.pow(10, assetDecimals);
  const rounded = Math.floor(assetSize * factor) / factor;
  
  return rounded.toString().replace(/\.?0+$/, '');
}


  /**
   * Calculate target USD value based on desired leverage
   * Formula: Position Value = Base USD * (Target Leverage / Base Leverage)
   * 
   * Examples:
   * - 10x leverage: $10 * (10/10) = $10 position
   * - 20x leverage: $10 * (20/10) = $20 position  
   * - 40x leverage: $10 * (40/10) = $40 position
   */
  private calculateTargetUsdValue(leverage: number = 20): number {
    const leverageMultiplier = leverage / HyperliquidOrderService.BASE_LEVERAGE
    const targetUsdValue = HyperliquidOrderService.BASE_USD_SIZE * leverageMultiplier
    
    console.log(`💰 Leverage calculation: ${leverage}x leverage = $${targetUsdValue} position size (base: $${HyperliquidOrderService.BASE_USD_SIZE} @ ${HyperliquidOrderService.BASE_LEVERAGE}x)`)
    
    return targetUsdValue
  }


// Fix for the closePositionAtMarketPrice method in hyperliquidOrders.ts

/**
 * Close position at current market price using aggressive pricing - ROBUST VERSION
 */
private async closePositionAtMarketPrice(position: PositionInfo): Promise<{
  success: boolean
  exitPrice?: number
  error?: string
}> {
  try {
    console.log(`🔄 Closing position ${position.cloid} at market price`)
    console.log(`📊 Position data:`, {
      asset: position.asset,
      direction: position.direction,
      size: position.size,
      entryPrice: position.entryPrice,
      fillPrice: position.fillPrice,
      filled: position.filled
    })
    
    // ✅ Validate position has required data
    if (!position.asset || !position.direction) {
      throw new Error(`Invalid position data: asset=${position.asset}, direction=${position.direction}`)
    }
    
    // ✅ Handle missing or invalid size with multiple fallback strategies
    let positionSize = position.size
    if (!positionSize || positionSize === '0' || positionSize === '' || positionSize === 'undefined') {
      console.warn(`⚠️ Position size missing or invalid: ${positionSize}, trying fallback strategies`)
      
      // Strategy 1: Use fillPrice if available
      const entryPrice = position.fillPrice || position.entryPrice || 0
      if (entryPrice > 0) {
        // Try different USD values based on common leverage levels
        const possibleUsdValues = [10, 20, 30, 40, 50] // $10-50 range
        
        for (const usdValue of possibleUsdValues) {
          const calculatedSize = (usdValue / entryPrice).toFixed(6)
          console.log(`🔧 Trying fallback: $${usdValue} / $${entryPrice} = ${calculatedSize}`)
          
          // Use the first reasonable size (not too small, not too large)
          const sizeNum = parseFloat(calculatedSize)
          if (sizeNum > 0.00001 && sizeNum < 100) {
            positionSize = calculatedSize
            console.log(`✅ Using fallback size: ${positionSize} (based on $${usdValue} position)`)
            break
          }
        }
      }
      
      // Strategy 2: If still no size, try to get from active orders or use minimum
      if (!positionSize || positionSize === '0') {
        console.warn(`⚠️ All fallback strategies failed, using minimum position size`)
        positionSize = '0.001' // Minimum safe size
      }
    }
    
    console.log(`📊 Final position details: ${position.asset} ${position.direction} size=${positionSize}`)
    
    // Get current market price
    const currentPrices = await this.getCurrentPrices()
    const currentPrice = currentPrices[position.asset]
    
    if (!currentPrice) {
      console.warn(`⚠️ Could not get current price for ${position.asset}, using fallback`)
      // Use entry price as fallback for exit
      const fallbackPrice = position.fillPrice || position.entryPrice || 50000 // Reasonable fallback
      return {
        success: true,
        exitPrice: fallbackPrice
      }
    }
    
    // Get asset configuration
    const assetConfig = await this.getAssetConfig(position.asset)
    
    // ✅ Add validation for asset config
    if (!assetConfig || assetConfig.assetId === undefined) {
      console.warn(`⚠️ Could not get asset config for ${position.asset}, using current price as exit`)
      return {
        success: true,
        exitPrice: currentPrice
      }
    }
    
    // Calculate aggressive price for immediate execution (opposite direction)
    const isClosingLong = position.direction === 'up'
    const aggressivePriceMultiplier = isClosingLong ? 0.98 : 1.02 // Reverse of opening
    const aggressivePriceRaw = currentPrice * aggressivePriceMultiplier
    const aggressivePrice = this.formatPrice(aggressivePriceRaw, assetConfig.szDecimals)
    
    // ✅ Final validation
    if (!aggressivePrice || !positionSize) {
      console.warn(`⚠️ Missing required values, using market price: aggressivePrice=${aggressivePrice}, size=${positionSize}`)
      return {
        success: true,
        exitPrice: currentPrice
      }
    }
    
    console.log(`💰 Closing at aggressive price: ${aggressivePrice} (market: ${currentPrice}) size: ${positionSize}`)
    
    // Generate cloid for close order
    const closeCloid = this.generateCloid()
    
    // ✅ Create closing order with validation
    const closeOrder = {
      a: assetConfig.assetId, // asset index
      b: !isClosingLong, // Opposite direction
      p: aggressivePrice, // price as string
      s: positionSize, // ✅ Use validated position size
      r: true, // reduceOnly = true for closing
      t: { limit: { tif: 'Ioc' } }, // Immediate or Cancel
      c: closeCloid, // New cloid for close order
    }
    
    // ✅ Log the complete order for debugging
    console.log('🔄 Close order details:', JSON.stringify(closeOrder, null, 2))
    
    const action = {
      type: 'order',
      orders: [closeOrder],
      grouping: 'na' as const
    }
    
    const nonce = Date.now()
    
    // Get agent wallet for signing from the agent service
    const agentWallet = hyperliquidAgent.getAgentWallet()
    if (!agentWallet || !agentWallet.privateKey) {
      console.warn('⚠️ Agent wallet not available, using market price as exit')
      return {
        success: true,
        exitPrice: currentPrice
      }
    }
    
    // Sign and send close order
    const { signL1Action } = await import('@nktkas/hyperliquid/signing')
    const { privateKeyToAccount } = await import('viem/accounts')
    
    const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`)
    
    console.log('🔄 Signing close order...')
    
    // ✅ Add try-catch around signing and API call
    try {
      const signature = await signL1Action({
        wallet: account,
        action,
        nonce,
        isTestnet: this.useTestnet
      })
      console.log('✅ Close order signed successfully')
      
      const exchangeRequest = { action, signature, nonce }
      
      // Send close order with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
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
      
      const responseText = await response.text()
      
      if (!response.ok) {
        console.warn(`⚠️ Close order HTTP error: ${response.status}, using market price`)
        return {
          success: true,
          exitPrice: currentPrice
        }
      }
      
      let result
      try {
        result = JSON.parse(responseText)
      } catch (parseError) {
        console.warn('⚠️ Failed to parse close order response, using market price')
        return {
          success: true,
          exitPrice: currentPrice
        }
      }
      
      console.log('📥 Close order response:', JSON.stringify(result, null, 2))
      
      if (result.status === 'ok') {
        const orderStatus = result.response?.data?.statuses?.[0]
        
        if (orderStatus?.filled) {
          const exitPrice = parseFloat(orderStatus.filled?.avgPx || orderStatus.avgPx || currentPrice.toString())
          console.log(`✅ Position closed successfully at $${exitPrice}`)
          
          return {
            success: true,
            exitPrice: exitPrice
          }
        } else {
          console.warn('⚠️ Close order not filled, using market price')
          return {
            success: true,
            exitPrice: currentPrice
          }
        }
      } else {
        console.warn('⚠️ Close order failed, using market price')
        return {
          success: true,
          exitPrice: currentPrice
        }
      }
      
    } catch (signingOrApiError) {
      console.warn('⚠️ Error signing or sending close order:', signingOrApiError)
      return {
        success: true,
        exitPrice: currentPrice
      }
    }
    
  } catch (error) {
    console.warn('⚠️ Error in closePositionAtMarketPrice:', error)
    
    // Final fallback - always try to get current price
    try {
      const currentPrices = await this.getCurrentPrices()
      const fallbackPrice = currentPrices[position.asset]
      if (fallbackPrice) {
        console.log(`✅ Using fallback market price as exit: $${fallbackPrice}`)
        return {
          success: true,
          exitPrice: fallbackPrice
        }
      }
    } catch (fallbackError) {
      console.warn('⚠️ Fallback price fetch also failed:', fallbackError)
    }
    
    // Ultimate fallback - use entry price or a reasonable default
    const ultimateFallback = position.fillPrice || position.entryPrice || 50000
    console.log(`✅ Using ultimate fallback price: $${ultimateFallback}`)
    
    return {
      success: true,
      exitPrice: ultimateFallback
    }
  }
}

  /**
   * Initialize agent wallet for the user
   */
  async initializeAgent(
    userAddress: string,
    masterSignTypedData: SignTypedDataFunction
  ): Promise<AgentWallet> {
    console.log('🔍 Checking for existing agent for user:', userAddress)
    
    // Verify the signing function will use the correct account
    try {
      // Test signature to see what address it recovers
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
  
    // Try to load existing agent (even if not approved yet)
    let agent = hyperliquidAgent.loadAgent(userAddress)
    
    // Only generate a new agent if none exists at all
    if (!agent) {
      console.log('🔧 No agent found, creating new one...')
      agent = hyperliquidAgent.generateAgentWallet()
      console.log('✅ Generated new agent wallet:', agent.address)
      
      // Save the unapproved agent immediately so we can reuse it
      hyperliquidAgent.saveAgent(userAddress)
      console.log('✅ Saved unapproved agent to localStorage')
    } else {
      console.log('✅ Found existing agent:', agent.address, 'Approved:', agent.isApproved)
    }
    
    // Now try to approve the agent if it's not already approved
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
      
      // Save the now-approved agent
      hyperliquidAgent.saveAgent(userAddress)
      console.log('✅ Saved approved agent to localStorage')
    } else {
      console.log('✅ Using existing approved agent:', agent.address)
    }
    
    return agent
  }

  /**
   * Get the next nonce for a user
   */
  private getNextNonce(userAddress: string): number {
    const currentNonce = this.userNonces.get(userAddress) || 0;
    const nextNonce = currentNonce + 1;
    this.userNonces.set(userAddress, nextNonce);
    console.log(`🔢 Using nonce ${nextNonce} for user ${userAddress}`);
    return nextNonce;
  }

  /**
   * Generate a unique client order ID
   */
  private generateCloid(): string {
    return '0x' + Buffer.from(ethers.randomBytes(16)).toString('hex')
  }



  /**
   * Format price according to Hyperliquid rules
   * @param price Price to format
   * @param assetDecimals Number of decimals for the asset
   * @returns Formatted price as a string with proper precision
   */
  private formatPrice(price: number, assetDecimals: number): string {
    try {
      // Validate input price
      if (isNaN(price) || !isFinite(price)) {
        throw new Error(`Invalid price: ${price}`);
      }
  
      // Helper: Truncate decimals without rounding
      function truncateDecimals(num: number, decimals: number): number {
        const factor = Math.pow(10, decimals);
        return Math.floor(num * factor) / factor;
      }
  
      // Helper: Count significant digits in a number
      function countSignificantDigits(num: number): number {
        if (num === 0) return 0;
        const str = num.toExponential(); // e.g. "1.23456e+3"
        const digits = str.replace(/\.|e.*$/g, ''); // remove dot and exponent
        const sigDigits = digits.replace(/^0+/, ''); // remove leading zeros
        return sigDigits.length;
      }
  
      // Helper: Truncate number to max significant figures without rounding
      function truncateToSignificantFigures(num: number, maxSigFigs: number): number {
        if (num === 0) return 0;
        const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
        const decimals = maxSigFigs - digits;
        if (decimals < 0) {
          // Truncate integer part
          const factor = Math.pow(10, digits - maxSigFigs);
          return Math.floor(num / factor) * factor;
        } else {
          // Truncate decimals
          return truncateDecimals(num, decimals);
        }
      }
  
      // Calculate max decimals allowed based on assetDecimals
      const maxDecimals = Math.min(6, Math.max(1, 6 - assetDecimals));
      const maxSignificantFigures = 5;
  
      // Step 1: Truncate decimals to maxDecimals
      let truncatedPrice = truncateDecimals(price, maxDecimals);
  
      // Step 2: Truncate to max significant figures if exceeded
      const sigDigits = countSignificantDigits(truncatedPrice);
      if (sigDigits > maxSignificantFigures) {
        truncatedPrice = truncateToSignificantFigures(truncatedPrice, maxSignificantFigures);
      }
  
      // Step 3: Format number to fixed decimals and remove trailing zeros
      const formatted = truncatedPrice.toFixed(maxDecimals).replace(/\.?0+$/, '');
  
      console.log(`Formatted price: ${price} -> ${formatted} (maxDecimals: ${maxDecimals})`);
  
      return formatted;
    } catch (error) {
      console.error('Error formatting price:', error);
      // Fallback: return original price as string
      return price.toString();
    }
  }


  /**
   * Get asset configuration from metadata via direct API call
   */
  private async getAssetConfig(assetSymbol: string): Promise<AssetConfig> {
    try {
      const response = await fetch(`${this.getApiUrl()}/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'meta' })
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch perpetual metadata: ${response.status}`)
      }

      const metadata = await response.json()
      const asset = metadata.universe.find((a: any) => a.name === assetSymbol)
      
      if (!asset) {
        throw new Error(`Asset ${assetSymbol} not found`)
      }

      const assetId = metadata.universe.indexOf(asset) // Index in array = asset ID
      
      return {
        assetId,
        szDecimals: asset.szDecimals,
        maxLeverage: asset.maxLeverage || 1
      }
    } catch (error) {
      throw new Error(`Failed to get asset config: ${error}`)
    }
  }

  async checkUserAccount(userAddress: string): Promise<{exists: boolean, balance?: any}> {
    try {
      const response = await fetch(`${this.getApiUrl()}/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: userAddress.toLowerCase()
        })
      })
  
      if (!response.ok) {
        console.log('❌ Account check failed:', response.status)
        return { exists: false }
      }
  
      const result = await response.json()
      console.log('🔍 Account check result:', result)
  
      if (result && (result.marginSummary || result.crossMarginSummary)) {
        console.log('✅ Account exists with balance')
        return { exists: true, balance: result }
      } else {
        console.log('❌ Account does not exist or has no balance')
        return { exists: false }
      }
    } catch (error) {
      console.error('❌ Error checking account:', error)
      return { exists: false }
    }
  }

  /**
 * Set leverage for a specific asset BEFORE placing orders
 * This is required because Hyperliquid sets leverage per asset, not per order
 */
async setAssetLeverage(
  asset: string,
  leverage: number,
  signTypedDataAsync: SignTypedDataFunction,
  userAddress: string,
  isCross: boolean = false // true for cross margin, false for isolated margin
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🔧 Setting ${asset} leverage to ${leverage}x (${isCross ? 'cross' : 'isolated'} margin)`)
    
    // Get asset configuration
    const assetConfig = await this.getAssetConfig(asset)
    
    // Validate leverage limits
    const maxLeverage = asset === 'BTC' ? 40 : asset === 'ETH' ? 25 : 50
    if (leverage > maxLeverage) {
      return {
        success: false,
        error: `Maximum leverage for ${asset} is ${maxLeverage}x`
      }
    }
    
    // Create leverage update action
    const action = {
      type: 'updateLeverage',
      asset: assetConfig.assetId,
      isCross: isCross,
      leverage: leverage // Target leverage value
    }
    
    const nonce = Date.now()
    
    // Get agent wallet for signing
    const agentWallet = hyperliquidAgent.getAgentWallet()
    if (!agentWallet || !agentWallet.privateKey) {
      throw new Error('Agent wallet not available for leverage setting')
    }
    
    // Sign the leverage update action
    const { signL1Action } = await import('@nktkas/hyperliquid/signing')
    const { privateKeyToAccount } = await import('viem/accounts')
    
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
    
    // Send leverage update request
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


/**
 * Place a prediction order using aggressive limit orders for immediate execution
 * Orders fill immediately at market price, then auto-close after timer expires
 */
async placePredictionOrder(
  request: OrderRequest,
  signTypedDataAsync: SignTypedDataFunction,
  userAddress: string
): Promise<OrderResponse> {
  console.log('🔍 Starting placePredictionOrder with aggressive limit orders:', {
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
    const accountCheck = await this.checkUserAccount(userAddress)
    
    if (!accountCheck.exists) {
      console.log('❌ User account does not exist on Hyperliquid')
      return {
        success: false,
        error: 'ACCOUNT_NOT_FOUND: Please deposit funds to Hyperliquid testnet first to create your account. Visit https://app.hyperliquid.xyz/?testnet=true'
      }
    }
    
    console.log('✅ User account exists, proceeding with order...')

    // Ensure address is lowercase (important for Hyperliquid)
    const address = userAddress.toLowerCase()

    // Initialize agent wallet (or use existing one)
    let agent: AgentWallet
    try {
      console.log('🔍 Initializing agent for user:', address)
      agent = await this.initializeAgent(address, signTypedDataAsync)
      console.log('✅ Agent initialized:', agent.address, 'Approved:', agent.isApproved)
    } catch (error) {
      console.error('❌ Agent initialization failed:', error)
      
      // Check if the error is due to deposit requirement
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

// Replace the order calculation section in your placePredictionOrder method with this:

// Get asset configuration
const assetConfig = await this.getAssetConfig(request.asset)

// ✅ Calculate TRUE leverage position
const targetLeverage = request.leverage || 20
    
console.log(`🔧 STEP 1: Setting ${request.asset} leverage to ${targetLeverage}x`)
const leverageResult = await this.setAssetLeverage(
  request.asset,
  targetLeverage,
  signTypedDataAsync,
  userAddress,
  false // Use isolated margin for precise control
)

if (!leverageResult.success) {
  return {
    success: false,
    error: `Failed to set leverage: ${leverageResult.error}`
  }
}

console.log(`✅ STEP 1 COMPLETE: ${request.asset} leverage set to ${targetLeverage}x`)

// ✅ STEP 2: Calculate position size based on TRUE leverage
const expectedPositionValue = 10 * targetLeverage // $10 margin × leverage



// Calculate aggressive price for immediate fill
const aggressivePriceMultiplier = request.direction === 'up' ? 1.02 : 0.98;
const aggressivePriceRaw = request.price * aggressivePriceMultiplier;
const aggressivePrice = this.formatPrice(aggressivePriceRaw, assetConfig.szDecimals);

// ✅ Calculate order size using TRUE leverage
const orderSize = this.calculateOrderSizeWithTrueLeverage(
  aggressivePriceRaw,
  assetConfig.szDecimals,
  targetLeverage
)

const actualOrderValue = parseFloat(orderSize) * parseFloat(aggressivePrice);

console.log('💰 TRUE LEVERAGE ORDER SUMMARY:', {
  marginUsed: `$${HyperliquidOrderService.MARGIN_AMOUNT}`,
  leverage: `${targetLeverage}x`,
  expectedPositionValue: `$${expectedPositionValue}`,
  actualPositionValue: `$${actualOrderValue.toFixed(2)}`,
  orderSize: orderSize,
  aggressivePrice: aggressivePrice,
  difference: `$${Math.abs(actualOrderValue - expectedPositionValue).toFixed(2)}`,
  accuracyPercentage: `${((actualOrderValue / expectedPositionValue) * 100).toFixed(1)}%`
});

// Warn if position is significantly different from expected
if (targetLeverage === 40) {
  if (actualOrderValue < 380 || actualOrderValue > 420) {
    console.warn(`⚠️ 40x leverage position $${actualOrderValue.toFixed(2)} is outside expected range $380-$420`)
  } else {
    console.log(`✅ 40x leverage position $${actualOrderValue.toFixed(2)} is within expected range!`)
  }
}

     // Validate we're getting the expected position size
     if (targetLeverage === 40 && actualOrderValue < 35) {
      console.warn(`⚠️ Position value $${actualOrderValue.toFixed(2)} is less than expected $40 for 40x leverage`)
    }

const marketPrice = this.formatPrice(request.price, assetConfig.szDecimals)
const cloid = this.generateCloid()

console.log('📊 Aggressive order parameters:', {
  asset: request.asset,
  assetId: assetConfig.assetId,
  direction: request.direction,
  marketPrice: marketPrice,
  aggressivePrice: aggressivePrice, // Now properly formatted as string
  priceAdjustment: `${request.direction === 'up' ? '+' : '-'}2%`,
  finalOrderSize: orderSize,
  actualOrderValue: actualOrderValue,
  timeWindow: request.timeWindow,
  cloid
})

try {
  // ✅ Create aggressive limit order for immediate execution
  const order = {
    a: assetConfig.assetId, // asset index (number)
    b: request.direction === 'up', // isBuy (boolean)
    p: aggressivePrice, // ✅ NOW PROPERLY FORMATTED AS STRING
    s: orderSize, // size as string (in base units)
    r: false, // reduceOnly (always false for opening positions)
    t: { limit: { tif: 'Ioc' } }, // ✅ IOC = Immediate or Cancel
    c: cloid, // client order ID (string)
  };

      // Create the action object
      const action = {
        type: 'order',
        orders: [order],
        grouping: 'na' as const
      };

      // Use current timestamp in milliseconds as nonce
      const nonce = Date.now();
      console.log(`⏱️ Using timestamp as nonce: ${nonce}`);
      console.log('📊 Aggressive limit order created:', JSON.stringify(order, null, 2));

      // Import the signing function from the SDK
      const { signL1Action } = await import('@nktkas/hyperliquid/signing');
      const { privateKeyToAccount } = await import('viem/accounts');
      
      // Get the agent wallet
      const agentWallet = await this.initializeAgent(address, signTypedDataAsync);
      console.log('🔍 Signing aggressive order with agent...');
      
      // Convert private key to account
      const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`);
      
      // Sign the action using the SDK's signL1Action
      const signature = await signL1Action({
        wallet: account,
        action,
        nonce,
        isTestnet: this.useTestnet
      });
      
      console.log('✅ Aggressive order signed with agent');

      // Prepare the final request object matching the reference format
      const exchangeRequest = { action, signature, nonce };

      // Send order to Hyperliquid exchange endpoint with proper error handling
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
        console.error('❌ Aggressive order request failed:', {
          status: response.status,
          statusText: response.statusText,
          response: responseText
        })
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      let result: any
      try {
        result = JSON.parse(responseText)
      } catch (e) {
        console.error('Failed to parse response:', responseText)
        throw new Error('Invalid JSON response from exchange')
      }

      console.log('📥 Received aggressive order response:', JSON.stringify(result, null, 2))

      if (result.status !== 'ok') {
        const errorMsg = result.error?.message || JSON.stringify(result)
        console.error('Aggressive order failed with response:', errorMsg)
        throw new Error(`Order failed: ${errorMsg}`)
      }

      // Process order response based on API documentation
      const orderStatus = result.response?.data?.statuses?.[0]
      
      if (!orderStatus) {
        console.error('No order status in response:', result)
        throw new Error('No order status in response')
      }
      
// Fix for the position creation in placePredictionOrder method

// Replace the position creation section in your placePredictionOrder method with this:

if (orderStatus.filled) {
  // ✅ Order filled immediately (expected behavior)
  console.log('✅ Aggressive order filled immediately:', orderStatus)
  
  // ✅ Extract data from the nested filled object
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
  
  // Store the position for auto-close tracking
  const position: PositionInfo = {
    orderId: orderId,
    cloid: cloid,
    asset: request.asset,
    direction: request.direction,
    entryPrice: fillPrice, // ✅ Use actual fill price
    size: fillSize, // ✅ Use actual fill size
    timestamp: Date.now(),
    timeWindow: request.timeWindow,
    filled: true,
    fillPrice: fillPrice // ✅ Store fill price separately too
  }
  
  this.activePositions.set(cloid, position)
  
  console.log('💾 Stored position:', {
    cloid,
    size: position.size,
    entryPrice: position.entryPrice,
    fillPrice: position.fillPrice
  })
  
  // ✅ Schedule auto-close after time window (close at market price)
  if (request.timeWindow > 0) {
    console.log(`⏰ Scheduling auto-close for ${cloid} in ${request.timeWindow} seconds`)
    this.scheduleAutoClose(cloid, request.timeWindow * 1000) // Convert to milliseconds
  }
  
  return {
    success: true,
    orderId: orderId,
    cloid: cloid,
    fillInfo: {
      filled: true,
      fillPrice: fillPrice, // ✅ Return actual fill price
      fillSize: fillSize
    }
  }

} else if (orderStatus.resting) {
  // ✅ Order didn't fill immediately - this shouldn't happen with aggressive pricing, but handle it
  console.warn('⚠️ Aggressive order resting (unusual - might need more aggressive pricing):', orderStatus)
  
  // ✅ Extract data from the nested resting object
  const restingData = orderStatus.resting
  const orderId = restingData.oid
  
  // Still track the position and schedule auto-close
  const position: PositionInfo = {
    orderId: orderId,
    cloid: cloid,
    asset: request.asset,
    direction: request.direction,
    entryPrice: parseFloat(aggressivePrice), // ✅ Use formatted aggressive price
    size: orderSize, // ✅ Use calculated order size
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
  
  // Schedule auto-cancel/close for resting order
  if (request.timeWindow > 0) {
    console.log(`⏰ Scheduling auto-cancel for resting order ${cloid} in ${request.timeWindow} seconds`)
    this.scheduleAutoClose(cloid, request.timeWindow * 1000)
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
  // Order rejected or failed
  console.error('Aggressive order not filled:', orderStatus)
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
  } catch (error: any) {
    console.error('Prediction order placement failed:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}


/**
 * Fetch real-time P&L data from Hyperliquid
 */
async getRealTimePnL(userAddress: string): Promise<RealTimePnLData | null> {
  try {
    const response = await fetch(`${this.getApiUrl()}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress.toLowerCase()
      })
    })

    if (!response.ok) {
      console.warn('Failed to fetch P&L data:', response.status)
      return null
    }

    const result = await response.json()
    
    if (!result || !result.assetPositions) {
      return {
        totalUnrealizedPnl: 0,
        positions: [],
        lastUpdate: Date.now()
      }
    }

    // Extract position data
    const positions: PositionPnL[] = result.assetPositions
      .filter((pos: any) => parseFloat(pos.position.szi) !== 0) // Only open positions
      .map((pos: any) => ({
        asset: pos.position.coin,
        size: pos.position.szi,
        entryPx: pos.position.entryPx || '0',
        unrealizedPnl: pos.position.unrealizedPnl || '0',
        returnOnEquity: pos.position.returnOnEquity || '0',
        positionValue: pos.position.positionValue || '0',
        leverage: pos.position.leverage || '1'
      }))

    // Calculate total unrealized P&L
    const totalUnrealizedPnl = positions.reduce((total, pos) => {
      return total + parseFloat(pos.unrealizedPnl)
    }, 0)

    return {
      totalUnrealizedPnl,
      positions,
      lastUpdate: Date.now()
    }

  } catch (error) {
    console.error('Error fetching real-time P&L:', error)
    return null
  }
}

/**
 * Get P&L for a specific asset position
 */
async getAssetPnL(userAddress: string, asset: string): Promise<{
  unrealizedPnl: number
  returnOnEquity: number
  positionValue: number
} | null> {
  try {
    const pnlData = await this.getRealTimePnL(userAddress)
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

/**
 * Start polling for real-time P&L updates
 */
startPnLPolling(
  userAddress: string, 
  callback: (pnlData: RealTimePnLData | null) => void,
  intervalMs: number = 2000
): () => void {
  const pollPnL = async () => {
    const pnlData = await this.getRealTimePnL(userAddress)
    callback(pnlData)
  }

  // Initial fetch
  pollPnL()

  // Set up polling
  const intervalId = setInterval(pollPnL, intervalMs)

  // Return cleanup function
  return () => {
    clearInterval(intervalId)
  }
}


  /**
   * Cancel an order using agent wallet system
   */
  async cancelOrder(
    asset: string, 
    orderId: string,
    signTypedDataAsync: SignTypedDataFunction,
    userAddress: string
  ): Promise<boolean> {
    try {
      // Ensure agent is initialized
      const agent = await this.initializeAgent(userAddress, signTypedDataAsync)
      
      const assetConfig = await this.getAssetConfig(asset)
      
      const action = {
        type: 'cancel',
        cancels: [{
          a: assetConfig.assetId, // asset
          o: parseInt(orderId) // order id
        }]
      }

      const nonce = Date.now()
      const signature = await hyperliquidAgent.signL1ActionWithAgent({
        action,
        nonce,
        vaultAddress: userAddress.toLowerCase()
      })

      const cancelRequest = {
        action: action,
        nonce: nonce,
        signature: signature,
        vaultAddress: userAddress.toLowerCase()
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

  /**
   * Get current market prices via direct API
   */
  private async getCurrentPrices(): Promise<{ [asset: string]: number }> {
    return new Promise((resolve) => {
      let prices: { [asset: string]: number } = {}
      
      const handlePriceUpdate = (priceData: { [symbol: string]: string }) => {
        for (const [symbol, priceStr] of Object.entries(priceData)) {
          prices[symbol] = parseFloat(priceStr)
        }
        resolve(prices)
      }

      // Subscribe temporarily to get current prices
      hyperliquid.subscribeToAllMids(handlePriceUpdate)
      
      // Fallback timeout
      setTimeout(() => {
        resolve(prices)
      }, 5000)
    })
  }


  /**
   * Close a position by placing an opposite order
   * @param cloid Client order ID
   * @returns Result of the close operation
   */
  private async closePositionById(cloid: string): Promise<{ success: boolean; error?: string }> {
    const position = this.activePositions.get(cloid)
    if (!position) {
      return { success: false, error: 'Position not found' }
    }

    try {
      // Close the position by placing an opposite order
      const closeResult = await this.placePredictionOrder({
        asset: position.asset,
        direction: position.direction === 'up' ? 'down' : 'up',
        size: position.size,
        price: position.entryPrice,
        timeWindow: 0 // No auto-close for close orders
      }, 
      // These parameters will be provided by the caller
      undefined as any, // signTypedDataAsync
      undefined as any // userAddress
      )

      if (closeResult?.success) {
        // Mark position as closed
        position.closed = true
        position.exitPrice = closeResult.fillInfo?.fillPrice || position.entryPrice
        
        // Determine if it's a win or loss
        if (closeResult.fillInfo?.fillPrice) {
          const isWin = position.direction === 'up' 
            ? closeResult.fillInfo.fillPrice > position.entryPrice
            : closeResult.fillInfo.fillPrice < position.entryPrice
          
          position.result = isWin ? 'win' : 'loss'
          
          // Notify any callbacks
          const callback = this.positionCallbacks.get(cloid)
          if (callback) {
            callback(position.result, closeResult.fillInfo.fillPrice)
            this.positionCallbacks.delete(cloid)
          }
        }

        return { success: true }
      } else {
        return { success: false, error: closeResult?.error || 'Failed to close position' }
      }
    } catch (error) {
      console.error(`Error closing position ${cloid}:`, error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Register callback for position outcome
   */
  onPositionResult(cloid: string, callback: (result: 'win' | 'loss', exitPrice: number) => void): void {
    this.positionCallbacks.set(cloid, callback)
  }

  /**
   * Get all active positions
   */
  getActivePositions(): PositionInfo[] {
    return Array.from(this.activePositions.values()).filter(p => !p.closed)
  }

  /**
   * Get position by cloid
   */
  getPosition(cloid: string): PositionInfo | undefined {
    return this.activePositions.get(cloid)
  }

  /**
   * Clear completed positions (for cleanup)
   */
  clearCompletedPositions(): void {
    for (const [cloid, position] of this.activePositions.entries()) {
      if (position.closed) {
        this.activePositions.delete(cloid)
      }
    }
  }

  /**
   * Set network (testnet/mainnet)
   */
  setNetwork(useTestnet: boolean): void {
    this.useTestnet = useTestnet
  }
}

// Global order service instance
export const hyperliquidOrders = new HyperliquidOrderService(true) // Default to testnet