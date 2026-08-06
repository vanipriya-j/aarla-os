import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getRequestAuth } from "@/lib/auth/request-auth";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aarla OS — Founder Operating System",
  description:
    "Aarla OS helps a single founder move from idea to product, manufacturing, launch, content, fulfilment and business review.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const auth = await getRequestAuth();

  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <AuthProvider
          role={auth.role}
          username={auth.username}
          sessionId={auth.sessionId}
          authEnabled={auth.authEnabled}
        >
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
