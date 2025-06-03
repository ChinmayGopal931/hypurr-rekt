import React from "react";
import { COLORS } from "../colors";

interface Props {
  children: React.ReactNode;
}

const Title = ({ children }: Props) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "379px",
        left: "318px",
        fontFamily: "IBM Plex Sans",
        fontSize: "22px",
        fontWeight: 400,
        color: COLORS.tagTitle
      }}
    >
      {children}
    </div>
  );
};

const Content = ({ children }: Props) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "406px",
        left: "318px",
        fontFamily: "IBM Plex Sans",
        fontSize: "29px",
        fontWeight: 600,
        color: COLORS.tagContent
      }}
    >
      {children}
    </div>
  );
};

export const ExitTag = (props: { exit: number }) => {
  const { exit } = props;
  const displayExit = exit.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
  return (
    <>
      <Title>Current Price</Title>
      <Content>{displayExit}</Content>
    </>
  );
};
