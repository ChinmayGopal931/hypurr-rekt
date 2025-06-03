// app/layout.tsx
import { Inter } from 'next/font/google'
import './globals.css'
import '@rainbow-me/rainbowkit/styles.css'
import { Providers } from '@/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'HYPURREKT',
  description: 'Fast-paced crypto price prediction game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen`}>
        <Providers>
          {children}
        </Providers>
        {/* <Toaster /> */}
      </body>
    </html>
  )
}