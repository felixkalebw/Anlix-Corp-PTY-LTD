import './globals.css'
import { Provider } from '@/components/Store'
import Shell from '@/components/Shell'

export const metadata = { title: 'Anlix Corp order tracker' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap" />
      </head>
      <body><Provider><Shell>{children}</Shell></Provider></body>
    </html>
  )
}
