import type { Metadata } from "next";
import {
  Inter,
  Lora,
  Merriweather,
  Montserrat,
  Oswald,
  Playfair_Display,
  Poppins,
  Raleway,
  Roboto,
  Work_Sans
} from "next/font/google";
import "./globals.css";
import { PersistenceBridge } from "./components/PersistenceBridge";

// All editor-selectable fonts (see lib/fonts.ts) — seven sans-serif, three serif.
// Each exposes a CSS variable; applying every variable to <html> lets
// `var(--font-x)` resolve anywhere. Poppins and Merriweather are static families,
// so their weights are named explicitly; the rest are variable fonts.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins"
});
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway" });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });
const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-merriweather"
});

const fontVariables = [
  inter,
  roboto,
  montserrat,
  poppins,
  raleway,
  workSans,
  oswald,
  playfair,
  lora,
  merriweather
]
  .map((font) => font.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "AI Slides",
  description: "A fluid slide editor."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={fontVariables} lang="en">
      <body>
        <PersistenceBridge />
        {children}
      </body>
    </html>
  );
}
