import React from "react";

import { HAPPY_PEPE, SAD_PEPE } from "../images";

export const Emotion = (props: { pnlRatio: number }) => {
  const { pnlRatio } = props;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        top: pnlRatio < 0 ? "200x" : "190px",
        left: pnlRatio < 0 ? "615px" : "618px"
      }}
    >
      <img src={pnlRatio > 0 ? HAPPY_PEPE : SAD_PEPE} width={320} height={320} style={{ borderRadius: "100%" }} />
    </div>
  );
};
