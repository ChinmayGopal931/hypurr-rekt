export type Params = {
  isLong: boolean;
  leverage: number;
  tradingPair: string;
  /** `0.69` means `+69.00%` */
  pnlRatio: number;
  entry: number;
  exit: number;
  refCode: string;
};
