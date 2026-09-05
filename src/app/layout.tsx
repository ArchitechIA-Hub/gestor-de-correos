import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geomini = localFont({
  variable: "--font-geomini",
  display: "swap",
  src: [
    { path: "../fonts/geomini/Geomini-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/geomini/Geomini-Medium.ttf", weight: "500", style: "normal" },
    { path: "../fonts/geomini/Geomini-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../fonts/geomini/Geomini-Bold.ttf", weight: "700", style: "normal" },
  ],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bandeja Ejecutiva",
  description: "Gestor de correo con IA: prioriza compromisos por urgencia real, no por orden cronológico.",
};

const THEME_INIT_SCRIPT = `
try {
  var theme = localStorage.getItem("theme");
  var dark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geomini.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
