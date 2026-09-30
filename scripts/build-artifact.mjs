// Builds the platform as a claude.ai Artifact: relative asset paths, fonts
// from Google Fonts (the only font host the Artifact CSP allows), sample data
// on first open, and a page file without <html>/<head>/<body> because the
// host wraps it in its own skeleton.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const out = 'dist-artifact'
execSync(`npx vite build --base ./ --outDir ${out} --emptyOutDir`, {
  stdio: 'inherit',
  env: { ...process.env, VITE_FONTS: 'google', VITE_AUTO_DEMO: '1' },
})

const html = readFileSync(`${out}/index.html`, 'utf8')
const pick = (re) => [...html.matchAll(re)].map((m) => m[0])
const title = pick(/<title>[^<]*<\/title>/g)[0]
const assets = pick(/<(script|link)\b[^>]*(src|href)="\.\/assets\/[^"]+"[^>]*>(<\/script>)?/g)

const page = [
  title,
  '<meta name="description" content="Material vendors ranked on SAP B1 purchasing data">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@500;600;700&display=swap">',
  ...assets,
  '<div id="root"></div>',
  '',
].join('\n')
writeFileSync(`${out}/page.html`, page)

const files = readdirSync(`${out}/assets`).map((f) => `assets/${f}`)
writeFileSync(`${out}/files.json`, JSON.stringify(Object.fromEntries(files.map((f) => [f, `${out}/${f}`])), null, 2))
console.log(page)
console.log(files)
