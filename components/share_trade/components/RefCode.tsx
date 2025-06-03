import React from "react";
import { COLORS } from "../colors";

const QrImage = (props: { qrDataUrl: string }) => {
  const { qrDataUrl } = props;
  return (
    <img
      src={qrDataUrl}
      width={88}
      height={88}
      style={{
        position: "absolute",
        top: "512px",
        left: "64px"
      }}
    />
  );
};

const ReadableTitle = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: "513px",
        left: "175px",
        fontFamily: "IBM Plex Sans",
        fontSize: "22px",
        fontWeight: 400,
        color: COLORS.refTitle
      }}
    >
      Referral Code
    </div>
  );
};

const ReadableContent = (props: { children: React.ReactNode }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "548px",
        left: "175px",
        fontFamily: "IBM Plex Sans",
        fontSize: "38px",
        fontWeight: 600,
        color: COLORS.refContent
      }}
    >
      {props.children}
    </div>
  );
};

export const RefCode = (props: { refCode: string; qrDataUrl: string }) => {
  const { refCode, qrDataUrl } = props;
  return (
    <>
      <QrImage qrDataUrl={qrDataUrl} />
      <ReadableTitle />
      <ReadableContent>{refCode}</ReadableContent>
    </>
  );
};
