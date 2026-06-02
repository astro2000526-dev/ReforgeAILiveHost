import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Noto_Sans } from "next/font/google";
import "./globals.css";

import { AppHeader } from "@/components/AppHeader";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getLocale } from "@/lib/locale-server";
import { cn } from "@/lib/utils";

const notoSansHeading = Noto_Sans({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reforge AI Live",
  description: "AI digital-human livestream studio",
};

const HTML_LANG: Record<string, string> = { en: "en", zh: "zh-CN", th: "th" };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={HTML_LANG[locale] ?? "en"}
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable, notoSansHeading.variable)}
      suppressHydrationWarning
    >
      <head>
        {/* Apply saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={locale}>
          <AppHeader />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
