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
  private static readonly FIXED_USD_SIZE = 10 // $10 per prediction
  
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
   * Schedules an auto-close for a position after the specified time window
   * @param cloid The client order ID of the position to close
   * @param timeWindowMs Time window in milliseconds after which to close the position
   */
  private scheduleAutoClose(cloid: string, timeWindowMs: number): void {
    console.log(`⏱️ Scheduling auto-close for position ${cloid} in ${timeWindowMs}ms`)
    
    // Clear any existing timeout for this position
    const existingTimeout = this.autoCloseTimeouts.get(cloid)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }
    
    // Set new timeout
    const timeoutId = setTimeout(async () => {
      try {
        console.log(`🔄 Auto-closing position ${cloid}`)
        const position = this.activePositions.get(cloid)
        if (!position) {
          console.warn(`Position ${cloid} not found for auto-close`)
          return
        }
        
        // Close the position using the correct method
        await this.closePositionById(cloid)
        this.activePositions.delete(cloid)
        console.log(`✅ Successfully auto-closed position ${cloid}`)
      } catch (error) {
        console.error(`Error in auto-close for position ${cloid}:`, error)
      } finally {
        this.autoCloseTimeouts.delete(cloid)
      }
    }, timeWindowMs)
    
    // Store the timeout ID so we can clear it if needed
    this.autoCloseTimeouts.set(cloid, timeoutId)
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
   * Calculate order size based on fixed USD amount
   * @param price Current price of the asset
   * @param assetDecimals Number of decimal places for the asset
   * @returns Size in asset units as a formatted string
   */
  private calculateOrderSize(price: number, assetDecimals: number): string {
    try {
      if (price <= 0) {
        throw new Error(`Invalid price: ${price}`);
      }
      
      const usdSize = HyperliquidOrderService.FIXED_USD_SIZE;
      const assetSize = usdSize / price;
      
      // Round down to avoid over-leveraging and respect minimum size requirements
      const factor = Math.pow(10, assetDecimals);
      const rounded = Math.floor(assetSize * factor) / factor;
      
      // Convert to string and remove trailing zeros and optional decimal point
      let formatted = rounded.toString();
      if (formatted.includes('.')) {
        // Remove trailing zeros and optional decimal point if all decimals are zero
        formatted = formatted.replace(/\.?0+$/, '');
      }
      
      // If we removed all decimals (e.g., '5.' -> '5'), ensure it's a valid number string
      if (formatted.endsWith('.')) {
        formatted = formatted.slice(0, -1);
      }
      
      // Ensure we don't return an empty string
      if (!formatted) {
        formatted = '0';
      }
      
      console.log(`Calculated order size: ${usdSize} USD / ${price} = ${formatted} (${assetDecimals} decimals)`);
      
      return formatted;
    } catch (error) {
      console.error('Error calculating order size:', error);
      // Return a safe minimum size as fallback (0.01 units)
      return (0.01).toFixed(assetDecimals);
    }
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
 * Place a prediction order using agent wallet system - MARKET ORDER VERSION
 */
async placePredictionOrder(
  request: OrderRequest,
  signTypedDataAsync: SignTypedDataFunction,
  userAddress: string
): Promise<OrderResponse> {
  console.log('🔍 Starting placePredictionOrder with:', {
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

    // Get asset configuration
    const assetConfig = await this.getAssetConfig(request.asset)
    
    // Calculate order parameters
    const orderSize = this.calculateOrderSize(parseFloat(request.size), assetConfig.szDecimals)
    const limitPrice = this.formatPrice(request.price, assetConfig.szDecimals)
    const cloid = this.generateCloid()
    
    console.log('📊 Order parameters:', {
      asset: request.asset,
      assetId: assetConfig.assetId,
      direction: request.direction,
      price: request.price,
      formattedPrice: limitPrice,
      size: request.size,
      formattedSize: orderSize,
      timeWindow: request.timeWindow,
      cloid
    })

    try {
      // ✅ Create MARKET order using trigger mechanism
      const order = {
        a: assetConfig.assetId, // asset index (number)
        b: request.direction === 'up', // isBuy (boolean)
        p: limitPrice, // price as string (still needed as reference)
        s: orderSize, // size as string (in base units)
        r: false, // reduceOnly (always false for opening positions)
        // ✅ CHANGED: Use trigger type for market order
        t: { 
          trigger: {
            isMarket: true, // ✅ This makes it a market order
            triggerPx: limitPrice, // ✅ Trigger price (current market price)
            tpsl: request.direction === 'up' ? 'tp' : 'sl' // ✅ Take profit for up, stop loss for down
          }
        },
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
      console.log('📊 Market order created:', JSON.stringify(order, null, 2));

      // Import the signing function from the SDK
      const { signL1Action } = await import('@nktkas/hyperliquid/signing');
      const { privateKeyToAccount } = await import('viem/accounts');
      
      // Get the agent wallet
      const agentWallet = await this.initializeAgent(address, signTypedDataAsync);
      console.log('🔍 Signing market order with agent...');
      
      // Convert private key to account
      const account = privateKeyToAccount(agentWallet.privateKey as `0x${string}`);
      
      // Sign the action using the SDK's signL1Action
      const signature = await signL1Action({
        wallet: account,
        action,
        nonce,
        isTestnet: this.useTestnet
      });
      
      console.log('✅ Market order signed with agent');

      // Prepare the final request object matching the reference format
      const exchangeRequest = { action, signature, nonce };

      // Log the complete request for debugging (without full signature for security)
      const signatureString = typeof signature === 'string' 
        ? signature 
        : JSON.stringify(signature);
        
      console.log('📤 Sending market order request:', JSON.stringify({
        action,
        nonce,
        signature: signatureString.slice(0, 20) + '...' // Show first 20 chars of signature
      }, null, 2));

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
        console.error('❌ Market order request failed:', {
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

      console.log('📥 Received market order response:', JSON.stringify(result, null, 2))

      if (result.status !== 'ok') {
        const errorMsg = result.error?.message || JSON.stringify(result)
        console.error('Market order failed with response:', errorMsg)
        throw new Error(`Market order failed: ${errorMsg}`)
      }

      // Process order response based on API documentation
      const orderStatus = result.response?.data?.statuses?.[0]
      
      if (!orderStatus) {
        console.error('No order status in response:', result)
        throw new Error('No order status in response')
      }
      
      if (orderStatus.filled) {
        // Market order filled immediately (expected behavior)
        console.log('✅ Market order filled immediately:', orderStatus)
        
        // Store the position
        const position: PositionInfo = {
          orderId: orderStatus.oid,
          cloid: cloid,
          asset: request.asset,
          direction: request.direction,
          entryPrice: parseFloat(orderStatus.avgPx || '0'),
          size: orderStatus.sz,
          timestamp: Date.now(),
          timeWindow: request.timeWindow,
          filled: true,
          fillPrice: parseFloat(orderStatus.avgPx || '0')
        }
        
        this.activePositions.set(cloid, position)
        
        // Schedule auto-close if timeWindow is set
        if (request.timeWindow > 0) {
          this.scheduleAutoClose(cloid, request.timeWindow)
        }
        
        return {
          success: true,
          orderId: orderStatus.oid,
          cloid: cloid,
          fillInfo: {
            filled: true,
            fillPrice: parseFloat(orderStatus.avgPx || '0'),
            fillSize: orderStatus.sz
          }
        }
      } else if (orderStatus.resting) {
        // Market order shouldn't typically rest, but handle it
        console.log('⚠️ Market order resting (unusual):', orderStatus)
        
        return {
          success: true,
          orderId: orderStatus.resting.oid,
          cloid: cloid,
          fillInfo: {
            filled: false
          }
        }
      } else {
        // Order rejected or failed
        console.error('Market order not filled:', orderStatus)
        return {
          success: false,
          error: `Market order not filled: ${JSON.stringify(orderStatus)}`,
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
    console.error('Market order placement failed:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
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