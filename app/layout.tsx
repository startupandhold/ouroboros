import type { Metadata } from "next";
import {
  Baloo_2,
  Cinzel,
  Instrument_Serif,
  Inter,
  Space_Grotesk,
} from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import "./ouro-lore.css";
import "./ouro-supply.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
});

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-cute",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Ouroboros Feeder",
  description:
    "Feed Solana tokens into OUROBOROS via Jupiter, burn supply, reclaim empty accounts.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${cinzel.variable} ${baloo.variable} ${serif.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
