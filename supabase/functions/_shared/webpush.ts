// Web Push for Edge Functions, with no dependencies: RFC 8291 message encryption
// (aes128gcm, RFC 8188) and RFC 8292 VAPID, using only WebCrypto. Runs in Deno and,
// for tests, in Node.

export interface PushTarget {
  endpoint: string
  /** The browser's P-256 public key (base64url, 65 bytes uncompressed). */
  p256dh: string
  /** The browser's 16-byte auth secret (base64url). */
  auth: string
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (the browser's applicationServerKey). */
  publicKey: string
  /** The private key's 32-byte scalar "d", base64url. */
  privateKey: string
  /** mailto: or https: contact for push services. */
  subject: string
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number; error: string }

const encoder = new TextEncoder()
const RECORD_SIZE = 4096

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/**
 * Encrypts one push message for one browser (RFC 8291). `salt` and `serverKeys` are only
 * passed by tests; normally both are fresh for every message.
 */
export async function encryptPayload(
  payload: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  options: { salt?: Uint8Array<ArrayBuffer>; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(target.p256dh)
  const authSecret = base64UrlDecode(target.auth)
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Invalid push subscription keys')

  const serverKeys =
    options.serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256))

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic), 32)
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, concat(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16)
  const nonce = await hkdf(salt, ikm, concat(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12)

  // One record: the payload, then the 0x02 "last record" delimiter (no padding).
  const plaintext = concat(payload, new Uint8Array([2]))
  if (plaintext.length + 16 > RECORD_SIZE) throw new Error('Push payload too large')
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext))

  // Header: salt (16) || record size (4, big-endian) || key id length (1) || key id (as_public)
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = asPublic.length
  return concat(header, asPublic, ciphertext)
}

const signingKeys = new Map<string, Promise<CryptoKey>>()

function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  let key = signingKeys.get(keys.privateKey)
  if (!key) {
    const pub = base64UrlDecode(keys.publicKey)
    if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 key')
    key = crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: base64UrlEncode(pub.subarray(1, 33)), y: base64UrlEncode(pub.subarray(33, 65)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    signingKeys.set(keys.privateKey, key)
  }
  return key
}

/** Authorization header for one push service (RFC 8292): a 12-hour ES256 JWT for its origin. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const json = (value: unknown) => base64UrlEncode(encoder.encode(JSON.stringify(value)))
  const unsigned = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(keys), encoder.encode(unsigned)))
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${keys.publicKey}`
}

/** Sends one notification. `gone` means the subscription is dead and should be deleted. */
export async function sendPush(target: PushTarget, payload: unknown, keys: VapidKeys, ttlSeconds = 24 * 3600): Promise<PushResult> {
  let res: Response
  try {
    const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), target)
    res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuthorization(target.endpoint, keys),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(ttlSeconds),
        urgency: 'normal',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: e instanceof Error ? e.message : String(e) }
  }
  if (res.ok) return { ok: true }
  const text = await res.text().catch(() => '')
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, error: text.slice(0, 200) }
}
