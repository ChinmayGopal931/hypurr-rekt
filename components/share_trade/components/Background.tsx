import React from "react";
import { BACKGROUND_IMAGE } from "../images";

export const Background = () => {
  return (
    <img
      src={BACKGROUND_IMAGE}
      width={1035}
      height={641}
      style={{
        position: "absolute",
        top: "-10px",
        left: "0px"
      }}
    />
  );
};
