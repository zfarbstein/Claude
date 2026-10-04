// Builds the demo and packs it into one self-contained page (an Artifact can't load other files).
//   node scripts/build-demo.mjs [output.html]
// Also writes dist-demo/demo.html, a full HTML document for local testing.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'dist-demo/chapter-calendar-demo.html'
execFileSync('npx', ['vite', 'build', '--config', 'vite.demo.config.ts', '--logLevel', 'warn'], { stdio: 'inherit' })

const index = readFileSync('dist-demo/index.html', 'utf8')
const jsPath = index.match(/<script[^>]+src="\.\/([^"]+\.js)"/)?.[1]
const cssPath = index.match(/<link[^>]+href="\.\/([^"]+\.css)"/)?.[1]
if (!jsPath || !cssPath) throw new Error('Could not find the built JS/CSS in dist-demo/index.html')
const js = readFileSync(join('dist-demo', jsPath), 'utf8').replace(/<\/script/gi, '<\\/script')
const css = readFileSync(join('dist-demo', cssPath), 'utf8').replace(/<\/style/gi, '<\\/style')

const body = `<title>Chapter Calendar Demo</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
writeFileSync(out, body)
writeFileSync(
  'dist-demo/demo.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${body}</body></html>`,
)
console.log(`demo page: ${out} (${Math.round(Buffer.byteLength(body) / 1024)} KB)`)
