import React from 'react';
import { TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PredictionPanelProps {
  onPrediction: (type: 'LONG' | 'SHORT') => void;
  disabled: boolean;
  selectedTimeframe: number;
  timeOptions: number[];
  onTimeframeChange: (time: number) => void;
}

const PredictionPanel: React.FC<PredictionPanelProps> = ({
  onPrediction,
  disabled,
  selectedTimeframe,
  timeOptions,
  onTimeframeChange
}) => {
  return (
    <Card className="relative bg-black/80 border-2 border-neon-green/30 backdrop-blur-sm">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="relative">
            <Zap className="w-6 h-6 text-neon-yellow animate-neon-pulse" />
            <div className="absolute -inset-1 bg-neon-yellow/20 rounded-full blur-sm"></div>
          </div>
          <h3 className="text-xl orbitron-text text-neon-yellow tracking-wider">
            MAKE PREDICTION
          </h3>
        </div>

        {/* Time Selection */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <Clock className="w-5 h-5 text-neon-blue" />
            <span className="text-neon-blue matrix-text font-semibold">TIME WINDOW</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {timeOptions.map((time) => (
              <button
                key={time}
                onClick={() => onTimeframeChange(time)}
                disabled={disabled}
                className={`p-3 rounded-lg border-2 transition-all duration-300 orbitron-text font-semibold
                           disabled:opacity-50 disabled:cursor-not-allowed
                           ${selectedTimeframe === time
                    ? 'border-neon-blue bg-neon-blue/20 text-neon-blue shadow-lg shadow-neon-blue/30'
                    : 'border-neon-blue/30 bg-black/40 text-neon-blue/70 hover:border-neon-blue/60 hover:bg-black/60'
                  }`}
              >
                {time}s
              </button>
            ))}
          </div>
        </div>

        {/* Prediction Buttons */}
        <div className="space-y-4">
          {/* LONG Button */}
          <Button
            onClick={() => onPrediction('LONG')}
            disabled={disabled}
            className="w-full h-20 text-2xl orbitron-text font-black tracking-wider
                       bg-gradient-to-r from-green-600 to-green-400 
                       hover:from-green-500 hover:to-green-300
                       border-2 border-green-400 prediction-button
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-300 group
                       shadow-lg shadow-green-400/30 hover:shadow-green-400/50"
          >
            <div className="flex items-center justify-center space-x-4">
              <TrendingUp className="w-8 h-8 group-hover:scale-110 transition-transform duration-300" />
              <span className="neon-text">LONG</span>
              <div className="text-base font-normal opacity-75">PRICE UP</div>
            </div>
          </Button>

          {/* Vs Divider */}
          <div className="relative flex items-center justify-center py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neon-green/30"></div>
            </div>
            <div className="relative bg-black px-4">
              <span className="text-neon-green matrix-text font-semibold">VS</span>
            </div>
          </div>

          {/* SHORT Button */}
          <Button
            onClick={() => onPrediction('SHORT')}
            disabled={disabled}
            className="w-full h-20 text-2xl orbitron-text font-black tracking-wider
                       bg-gradient-to-r from-red-600 to-red-400 
                       hover:from-red-500 hover:to-red-300
                       border-2 border-red-400 prediction-button
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-300 group
                       shadow-lg shadow-red-400/30 hover:shadow-red-400/50"
          >
            <div className="flex items-center justify-center space-x-4">
              <TrendingDown className="w-8 h-8 group-hover:scale-110 transition-transform duration-300" />
              <span className="neon-text">SHORT</span>
              <div className="text-base font-normal opacity-75">PRICE DOWN</div>
            </div>
          </Button>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 rounded-lg border border-neon-green/20 bg-black/40">
          <div className="text-center">
            <div className="text-neon-green/60 matrix-text text-sm mb-2">
              &gt; PREDICTION RULES &lt;
            </div>
            <div className="text-neon-green text-xs matrix-text leading-relaxed">
              Choose LONG if you think the price will go UP<br />
              Choose SHORT if you think the price will go DOWN<br />
              Your prediction locks in for the selected timeframe
            </div>
          </div>
        </div>

        {/* Risk Warning */}
        {!disabled && (
          <div className="mt-4 p-3 rounded border border-neon-yellow/30 bg-neon-yellow/5">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-neon-yellow animate-pulse" />
              <span className="text-neon-yellow text-xs matrix-text">
                READY TO ENGAGE - CHOOSE YOUR PREDICTION
              </span>
            </div>
          </div>
        )}

        {disabled && (
          <div className="mt-4 p-3 rounded border border-neon-pink/30 bg-neon-pink/5">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-neon-pink animate-pulse" />
              <span className="text-neon-pink text-xs matrix-text">
                PREDICTION ACTIVE - MONITORING PRICE ACTION
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Corner decorations */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-neon-yellow/50"></div>
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-neon-yellow/50"></div>
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-neon-yellow/50"></div>
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-neon-yellow/50"></div>
    </Card>
  );
};

export default PredictionPanel;