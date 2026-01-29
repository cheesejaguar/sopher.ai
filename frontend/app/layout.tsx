import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'sopher.ai - AI Book Writing System',
  description: 'Transform your ideas into complete manuscripts with AI-powered writing assistance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
