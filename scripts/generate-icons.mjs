// Renders the PWA / Apple icons from public/favicon.svg. Run: npm run icons
import { mkdirSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/favicon.svg')
mkdirSync('public/icons', { recursive: true })

const plain = async (size, file) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/icons/${file}`)

// Maskable / Apple icons need a full-bleed background with the glyph inside the safe zone.
const padded = async (size, file, scale) => {
  const inner = Math.round(size * scale)
  const glyph = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: '#0021A5' } })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(`public/icons/${file}`)
}

await plain(192, 'icon-192.png')
await plain(512, 'icon-512.png')
await padded(512, 'icon-maskable-512.png', 0.72)
await padded(180, 'apple-touch-icon.png', 0.86)
console.log('icons written to public/icons')
