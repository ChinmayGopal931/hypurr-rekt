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
        left: "60px",
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
        left: "60px",
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

export const EntryTag = (props: { entry: number }) => {
  const { entry } = props;
  const displayEntry = entry.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
  return (
    <>
      <Title>Entry Price</Title>
      <Content>{displayEntry}</Content>
    </>
  );
};
