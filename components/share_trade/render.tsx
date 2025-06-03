// render.tsx (or your image generation module)
import React from 'react';
import satori from 'satori';
// import QRCode from 'qrcode';

// Assuming these components are correctly defined and imported within this module's scope
import { Logo } from './components/Logo';
import { LeverageBadge } from './components/LeverageBadge';
import { TradingPair } from './components/TradingPair';
import { PnlHero } from './components/PnlHero';
import { EntryTag } from './components/EntryTag';
import { ExitTag } from './components/ExitTag';
import { LeveragePairDivider } from './components/LeveragePairDivider';
import { Background } from './components/Background';
import { Emotion } from './components/Emotion';

async function fetchFont(url: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url); // Path should be relative to public directory
    console.log(`Font fetch attempt for ${url}: Status ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text(); // Get more details if it's a text-based error like 404 page
      console.error(`Failed to fetch font ${url}: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 500)}`);
      throw new Error(`Failed to fetch font ${url}: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    // Basic check to see if we got HTML instead of a font
    if (arrayBuffer.byteLength > 0) {
      const firstBytes = new Uint8Array(arrayBuffer.slice(0, 15));
      const firstChars = new TextDecoder().decode(firstBytes);
      if (firstChars.toLowerCase().includes("<!doctype") || firstChars.toLowerCase().includes("<html")) {
        console.error(`Error in fetchFont for ${url}: Received HTML instead of font data. Please check the font path and server configuration.`);
        throw new Error(`Error in fetchFont for ${url}: Received HTML instead of font data.`);
      }
    }
    return arrayBuffer;
  } catch (error) {
    console.error(`Exception in fetchFont for ${url}:`, error);
    throw error; // Re-throw the error to be caught by the caller
  }
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not create canvas context'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not convert canvas to blob'));
        }
      }, 'image/png'); // Specify PNG format
    };
    img.onerror = (e) => {
      console.error("Image load error for SVG to PNG conversion:", e);
      reject(new Error('Error loading SVG into image for PNG conversion'));
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); // Ensure proper SVG encoding
  });
}

export const render = async (params: {
  pnlRatio: number; // e.g., 10.5 for 10.5%
  leverage: number;
  entry: number;
  exit: number;
  isLong: boolean;
  tradingPair: string; // e.g., "BTCUSD"
  refCode: string;
}) => {
  const { leverage, isLong, tradingPair, pnlRatio, entry, exit } = params;
  // const qrDataUrl = await QRCode.toDataURL(refCode.length > 0 ? `https://app.hyperliquid.trade/?ref=${refCode}` : 'https://hyperliquid.com');

  // Corrected font paths
  const fontBoldPath = '/assets/fonts/DMSans-Bold.ttf'; // Changed from IBMPlexSans-SemiBold
  const fontRegularPath = '/assets/fonts/DMSans-Regular.ttf'; // Changed from IBMPlexSans-Regular

  try {
    const fontSemiBoldData = await fetchFont(fontBoldPath);
    const fontRegularData = await fetchFont(fontRegularPath);

    const svg = await satori(
      <>
        <Background />
        <Logo />
        <Emotion pnlRatio={pnlRatio} />
        <LeverageBadge leverage={leverage} isShort={!isLong} />
        <LeveragePairDivider />
        <TradingPair tradingPair={tradingPair} />
        <PnlHero pnlRatio={pnlRatio / 100} /> {/* PnlHero expects a decimal like 0.105 */}
        <EntryTag entry={entry} />
        <ExitTag exit={exit} />
      </>,
      {
        width: 1035,
        height: 624,
        fonts: [
          {
            name: "IBM Plex Sans",
            data: fontSemiBoldData,
            weight: 600,
            style: "normal"
          },
          {
            name: "IBM Plex Sans",
            data: fontRegularData,
            weight: 400,
            style: "normal"
          }
        ]
      }
    );
    return await svgToPng(svg, 1035, 624); // This returns a Blob object
  } catch (error) {
    console.error("Error during satori rendering or font fetching:", error);
    // Check if the error is from fetchFont due to HTML content
    if (error instanceof Error && error.message.includes("Received HTML instead of font data")) {
      throw new Error("Failed to load fonts for image generation. Please ensure font files are correctly placed in the public/assets/fonts directory and the paths are correct.");
    }
    throw error; // Re-throw other errors
  }
};