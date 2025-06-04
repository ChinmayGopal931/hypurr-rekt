// GameCompletionModal.tsx - Fixed P&L calculation for long/short positions
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  PlayCircle,
  BarChart3,
  Image as ImageIcon
} from 'lucide-react';
import { render } from "./share_trade/render"
import { GameStats, Prediction } from '@/lib/types';

interface GameCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
  prediction: Prediction;
  actualExitPrice: number;
  gameStats: GameStats;
  leverage: number;
  positionValue: number;
  // Real trade data from API
  actualEntryPrice?: number;  // Real fill price from API
  positionSize?: string;      // Actual position size (e.g., "0.0037")
  realPnLDollar?: number;     // Real P&L in USD from API
}

export function GameCompletionModal({
  isOpen,
  onClose,
  onPlayAgain,
  prediction,
  actualExitPrice,
  gameStats,
  leverage,
  positionValue,
  actualEntryPrice,
  positionSize,
  realPnLDollar
}: GameCompletionModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [soundPlayed, setSoundPlayed] = useState(false);
  const [shareableImageUrl, setShareableImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // ✅ Use actual API data when available, fallback to prediction data
  const entryPrice = actualEntryPrice ?? prediction.entryPrice;
  const priceDiff = actualExitPrice - entryPrice;
  const priceMovement = Math.abs(priceDiff);
  const percentageMove = (priceMovement / entryPrice) * 100;

  // GameCompletionModal.tsx - Fixed fallback calculation to include leverage
  // This shows the corrected calculateRealResult function

  const calculateRealResult = (): {
    dollarPnL: number;
    percentagePnL: number;
    isRealData: boolean;
    actualResult: 'win' | 'loss';
  } => {
    // First priority: Use real P&L from API if available
    if (realPnLDollar !== undefined) {
      const realPercentage = (Math.abs(realPnLDollar) / positionValue) * 100;
      return {
        dollarPnL: realPnLDollar,
        percentagePnL: realPercentage,
        isRealData: true,
        actualResult: realPnLDollar >= 0 ? 'win' : 'loss'
      };
    }

    // Second priority: Calculate from actual prices and position size
    if (actualEntryPrice && positionSize) {
      const sizeNumber = parseFloat(positionSize);
      // ✅ FIXED: Account for trade direction in P&L calculation
      // For SHORT: profit when price goes DOWN (entry > exit)
      // For LONG: profit when price goes UP (exit > entry)
      const dollarPnL = prediction.direction === 'up'
        ? (actualExitPrice - actualEntryPrice) * sizeNumber  // LONG position
        : (actualEntryPrice - actualExitPrice) * sizeNumber; // SHORT position
      const percentagePnL = (Math.abs(dollarPnL) / positionValue) * 100;
      return {
        dollarPnL,
        percentagePnL,
        isRealData: true,
        actualResult: dollarPnL >= 0 ? 'win' : 'loss'
      };
    }

    // Fallback: Use percentage estimation based on direction prediction
    const didPriceGoUp = priceDiff > 0;
    const predictedUp = prediction.direction === 'up';
    const isCorrectPrediction = didPriceGoUp === predictedUp;

    // ✅ FIXED: Apply leverage to the fallback calculation
    const estimatedPnL = (positionValue * percentageMove * leverage) / 100;
    const leveragedPnL = estimatedPnL * (isCorrectPrediction ? 1 : -1);

    return {
      dollarPnL: leveragedPnL,
      percentagePnL: percentageMove * leverage, // ✅ FIXED: Apply leverage to percentage display
      isRealData: false,
      actualResult: isCorrectPrediction ? 'win' : 'loss'
    };
  };
  const { dollarPnL, percentagePnL, isRealData, actualResult } = calculateRealResult();

  // ✅ Use actual result based on real P&L data, not prediction.result
  const isWin = actualResult === 'win';

  useEffect(() => {
    if (isOpen && !soundPlayed) {
      setSoundPlayed(true);
    }
  }, [isOpen, soundPlayed]);

  useEffect(() => {
    if (!isOpen) {
      setSoundPlayed(false);
      setShowDetails(false);
      if (shareableImageUrl) {
        URL.revokeObjectURL(shareableImageUrl);
      }
      setShareableImageUrl(null);
      setGenerationError(null);
      setIsGeneratingImage(false);
    }
  }, [isOpen, shareableImageUrl]);

  useEffect(() => {
    return () => {
      if (shareableImageUrl) {
        URL.revokeObjectURL(shareableImageUrl);
      }
    };
  }, [shareableImageUrl]);

  const handleGenerateImage = async () => {
    setIsGeneratingImage(true);
    setShareableImageUrl(null);
    setGenerationError(null);

    // ✅ Use real P&L percentage for image generation
    const pnlPercentage = isWin ? percentagePnL : -percentagePnL;
    const refCodeToUse = "HYPURR-REKT";

    const params = {
      pnlRatio: pnlPercentage,
      leverage: leverage,
      entry: entryPrice,  // ✅ Use actual entry price
      exit: actualExitPrice,
      isLong: prediction.direction === 'up',
      tradingPair: prediction.asset.name.replace('/', ''),
      refCode: refCodeToUse,
    };

    try {
      console.log("Requesting trade image with REAL data params:", params);
      const imageBlob = await render(params);
      if (imageBlob) {
        setShareableImageUrl(URL.createObjectURL(imageBlob));
      } else {
        throw new Error("Image generation returned an empty result.");
      }
    } catch (error) {
      console.error("Error generating trade preview in modal:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Failed to load fonts") || errorMessage.includes("Received HTML instead of font data")) {
        setGenerationError("Error: Could not load resources for image generation. Please try again or contact support if the issue persists.");
      } else {
        setGenerationError(`Failed to generate image: ${errorMessage}`);
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.8, y: 50 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25, staggerChildren: 0.1 } },
    exit: { opacity: 0, scale: 0.8, y: 50, transition: { duration: 0.2 } }
  };

  const childVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 overflow-hidden">
            <DialogTitle className="text-slate-200">Game Completed</DialogTitle>
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              {/* Header with result - now based on actual P&L */}
              <motion.div
                variants={childVariants}
                className="text-center space-y-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: 360 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${isWin
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                    }`}
                >
                  <img
                    src={isWin ? '/assets/images/hypurr/throne.png' : '/assets/images/hypurr/cry.png'}
                    alt={isWin ? "Happy cat" : "Sad cat"}
                    className="w-22 h-22 object-contain"
                  />
                </motion.div>

                <motion.div variants={childVariants}>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className={`text-4xl font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                      {isWin ? 'YOU WON!' : 'YOU LOST'}
                    </div>
                  </div>
                  <div className="text-slate-400">
                    Game completed after {prediction.timeWindow} seconds
                  </div>
                  {/* ✅ Add indicator for real vs estimated data */}
                  <div className="text-xs text-slate-500 mt-1">
                    {isRealData ? '📊 Real trade data' : '📈 Estimated based on price movement'}
                  </div>
                </motion.div>

                <motion.div
                  variants={childVariants}
                  className="bg-slate-800/50 rounded-lg p-4"
                >
                  <div className="flex items-center justify-center space-x-4 mb-3">
                    <div className="text-center">
                      <div className="text-slate-400 text-sm">Entry</div>
                      <div className="text-white font-mono text-lg">
                        ${entryPrice.toLocaleString()}
                      </div>
                    </div>

                    <div className={`flex items-center space-x-1 ${prediction.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                      {prediction.direction === 'up' ? (
                        <TrendingUp className="w-6 h-6" />
                      ) : (
                        <TrendingDown className="w-6 h-6" />
                      )}
                      <Zap className="w-4 h-4" />
                    </div>

                    <div className="text-center">
                      <div className="text-slate-400 text-sm">Exit</div>
                      <div className="text-white font-mono text-lg">
                        ${actualExitPrice.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className={`text-2xl font-bold font-mono ${priceDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}
                    </div>
                    <div className={`text-sm ${priceDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {percentageMove.toFixed(3)}% move
                    </div>
                  </div>
                </motion.div>

                {/* ✅ Real P&L Display - now determines the win/loss correctly */}
                <motion.div
                  variants={childVariants}
                  className={`bg-slate-800/30 rounded-lg p-4 border ${isWin ? 'border-green-500/30' : 'border-red-500/30'}`}
                >
                  <div className="text-center">
                    <div className="text-slate-400 text-sm mb-2">
                      {isRealData ? 'Actual P&L' : 'Estimated P&L'}
                    </div>
                    <div className={`text-3xl font-bold font-mono ${dollarPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {dollarPnL >= 0 ? '+' : ''}${dollarPnL.toFixed(2)}
                    </div>
                    <div className={`text-lg font-mono ${dollarPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {dollarPnL >= 0 ? '+' : ''}{percentagePnL.toFixed(2)}%
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              {/* Trade Details Toggle */}
              <motion.div variants={childVariants}>
                <Button
                  variant="outline"
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full mb-4 text-slate-300 border-slate-600 hover:bg-slate-700/50"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  {showDetails ? 'Hide' : 'Show'} Trade Details
                </Button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      <Card className="p-4 bg-slate-800/30 border-slate-700">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Asset:</span>
                              <span className="text-white">{prediction.asset.name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Direction:</span>
                              <div className={`flex items-center space-x-1 ${prediction.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                                {prediction.direction === 'up' ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : (
                                  <TrendingDown className="w-3 h-3" />
                                )}
                                <span>{prediction.direction.toUpperCase()}</span>
                              </div>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Leverage:</span>
                              <span className="text-blue-400">{leverage}x</span>
                            </div>
                            {/* ✅ Show actual position size if available */}
                            {positionSize && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">Size:</span>
                                <span className="text-white font-mono">{positionSize}</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Position:</span>
                              <span className="text-white">${positionValue.toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Duration:</span>
                              <span className="text-white">{prediction.timeWindow}s</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Entry Price:</span>
                              <span className="text-white font-mono">${entryPrice.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Exit Price:</span>
                              <span className="text-white font-mono">${actualExitPrice.toFixed(1)}</span>
                            </div>
                            {/* ✅ Show data source */}
                            <div className="flex justify-between">
                              <span className="text-slate-400">Data:</span>
                              <span className={`text-xs ${isRealData ? 'text-green-400' : 'text-yellow-400'}`}>
                                {isRealData ? 'API' : 'Estimated'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Shareable Image Section */}
              <motion.div variants={childVariants}>
                <Button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                  className="w-full mb-3 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  {isGeneratingImage ? 'Generating Image...' : 'Create Shareable Image'}
                </Button>
                {generationError && (
                  <p className="text-red-500 text-xs text-center mb-2 px-2">{generationError}</p>
                )}
                {shareableImageUrl && !generationError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 mb-3"
                  >
                    <img src={shareableImageUrl} alt="Trade Summary" className="rounded-lg border border-slate-700 mx-auto" />
                  </motion.div>
                )}
              </motion.div>

              {/* Stats Update */}
              <motion.div
                variants={childVariants}
                className="bg-slate-800/30 rounded-lg p-4"
              >
                <div className="text-center mb-3">
                  <div className="text-slate-400 text-sm">Updated Stats</div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {gameStats.totalGames}
                    </div>
                    <div className="text-slate-400 text-xs">Total Games</div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-green-400">
                      {gameStats.wins}
                    </div>
                    <div className="text-slate-400 text-xs">Wins</div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-blue-400">
                      {gameStats.winRate.toFixed(1)}%
                    </div>
                    <div className="text-slate-400 text-xs">Win Rate</div>
                  </div>
                </div>

                {gameStats.currentStreak > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="mt-3 text-center"
                  >
                    <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 bg-yellow-500/10">
                      {gameStats.currentStreak} Win Streak!
                    </Badge>
                  </motion.div>
                )}
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                variants={childVariants}
                className="flex space-x-3 pt-2"
              >
                <Button
                  onClick={onPlayAgain}
                  className={`flex-1 ${isWin
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                    } text-white`}
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Play Again
                </Button>

                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 text-slate-300 border-slate-600 hover:bg-slate-700/50"
                >
                  View Dashboard
                </Button>
              </motion.div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}