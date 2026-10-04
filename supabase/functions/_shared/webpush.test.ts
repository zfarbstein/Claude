// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { base64UrlDecode, base64UrlEncode, encryptPayload, vapidAuthorization } from './webpush'

const enc = new TextEncoder()

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

/** What the browser does on receipt (RFC 8291 section 3.4, read independently of the sender code). */
async function browserDecrypt(body: Uint8Array<ArrayBuffer>, ua: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const ikm = await hkdf(auth, secret, join(enc.encode('WebPush: info\u0000'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\u0000'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\u0000'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  return { rs, idlen, delimiter: plain[plain.length - 1], text: new TextDecoder().decode(plain.slice(0, -1)) }
}

describe('Web Push encryption (RFC 8291)', () => {
  it('produces a message the browser can decrypt', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const target = { p256dh: base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: base64UrlEncode(auth) }
    const message = JSON.stringify({ title: 'Chapter Meeting', body: 'Starts at 7:00 PM · Chapter House', url: '/?event=1' })
    const body = await encryptPayload(enc.encode(message), target)
    const result = await browserDecrypt(body, ua, auth)
    expect(result).toEqual({ rs: 4096, idlen: 65, delimiter: 2, text: message })
  })

  it('uses a fresh key and salt for every message', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const target = { p256dh: base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: base64UrlEncode(new Uint8Array(16)) }
    const a = await encryptPayload(enc.encode('x'), target)
    const b = await encryptPayload(enc.encode('x'), target)
    expect(base64UrlEncode(a.slice(0, 86))).not.toBe(base64UrlEncode(b.slice(0, 86)))
  })

  it('rejects malformed subscription keys', async () => {
    await expect(encryptPayload(enc.encode('x'), { p256dh: 'AAAA', auth: 'AAAA' })).rejects.toThrow('Invalid push subscription keys')
  })
})

describe('VAPID (RFC 8292)', () => {
  it('signs a 12-hour JWT for the push service origin', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const publicKey = base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
    const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!
    const now = Date.parse('2026-10-04T12:00:00Z')
    const header = await vapidAuthorization('https://web.push.apple.com/QGuQyavXutnMH', { publicKey, privateKey, subject: 'mailto:exec@example.com' }, now)
    const [, token, k] = header.match(/^vapid t=(\S+), k=(\S+)$/)!
    const [h, c, sig] = token.split('.')
    expect(k).toBe(publicKey)
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c)))).toEqual({ aud: 'https://web.push.apple.com', exp: now / 1000 + 43200, sub: 'mailto:exec@example.com' })
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, base64UrlDecode(sig), enc.encode(`${h}.${c}`))
    expect(valid).toBe(true)
  })
})
