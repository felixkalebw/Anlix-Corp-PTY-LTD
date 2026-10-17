// Browser security headers for the whole site.
// The Supabase address is read from the same variable the app uses, so the policy always matches your project.
const isDev = process.env.NODE_ENV !== 'production'

let supaOrigin = 'https://*.supabase.co'
let supaSocket = 'wss://*.supabase.co'
try {
  const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  supaOrigin = u.origin
  supaSocket = 'wss://' + u.host
} catch {}

const csp = [
  "default-src 'self'",
  // Next.js writes small inline scripts to start the page, so 'unsafe-inline' is needed here. 'unsafe-eval' is only allowed while developing.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${supaOrigin} ${supaSocket}${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  "frame-ancestors 'none'", // nobody can put this site inside a frame (stops clickjacking)
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const security = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

module.exports = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: security },
      // Pages and API answers are never kept in the browser or a proxy cache. Fingerprinted files in /_next/static and image files keep their normal caching.
      { source: '/((?!_next/static|_next/image|.*\\..*).*)', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    ]
  },
}
