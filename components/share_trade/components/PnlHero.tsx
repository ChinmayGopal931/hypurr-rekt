import React from "react";
import { COLORS } from "../colors";

export const PnlHero = (props: { pnlRatio: number }) => {
  const { pnlRatio } = props;
  const displayPnL = pnlRatio.toLocaleString("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  let sign = "";
  if (pnlRatio > 0) {
    sign = "+";
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "240px",
        left: "56px",
        fontFamily: "IBM Plex Sans",
        fontSize: "94px",
        fontWeight: 600,
        color: pnlRatio > 0 ? COLORS.heroContentUp : COLORS.heroContentDown
      }}
    >
      {sign + displayPnL}
    </div>
  );
};
