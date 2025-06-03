import React from "react";
import { COLORS } from "../colors";

export const LeverageBadge = (props: { leverage: number; isShort: boolean }) => {
  const { leverage, isShort } = props;
  return (
    <div
      style={{
        position: "absolute",
        top: "209px",
        left: "60px",
        fontFamily: "IBM Plex Sans",
        fontSize: "22px",
        fontWeight: 400,
        color: isShort ? COLORS.badgeTextDown : COLORS.badgeTextUp,
        backgroundColor: isShort ? COLORS.badgeBackgroundDown : COLORS.badgeBackgroundUp,
        padding: "0px 16px 4px 16px",
        borderRadius: "8px"
      }}
    >
      {(isShort ? "Short " : "Long ") + String(leverage) + "X"}
    </div>
  );
};
