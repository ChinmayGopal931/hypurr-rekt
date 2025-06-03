import React from "react";
import { COLORS } from "../colors";

export const TradingPair = (props: { tradingPair: string }) => {
  const { tradingPair } = props;
  return (
    <div
      style={{
        position: "absolute",
        top: "202px",
        left: "242px",
        fontFamily: "IBM Plex Sans",
        fontSize: "30px",
        fontWeight: 600,
        color: COLORS.tagContent
      }}
    >
      {tradingPair}
    </div>
  );
};
