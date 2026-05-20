import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '极简番茄',
  description: '一个极简风格的番茄钟应用',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#F5F5F5] antialiased">
        {children}
      </body>
    </html>
  )
}
