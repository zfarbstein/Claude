// Creates the VAPID key pair Web Push needs (run once per chapter, keep the private key secret):
//   npm run vapid
// Put VAPID_PUBLIC_KEY in Vercel as VITE_VAPID_PUBLIC_KEY, and both keys in Supabase Edge Function secrets.
import { webcrypto } from 'node:crypto'

const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', publicKey)).toString('base64url')
const { d } = await webcrypto.subtle.exportKey('jwk', privateKey)

console.log(`VAPID_PUBLIC_KEY=${raw}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
console.log('VAPID_SUBJECT=mailto:you@yourchapter.org')
