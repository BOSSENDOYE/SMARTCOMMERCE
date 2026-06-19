/**
 * Génère les icônes PNG (192x192 et 512x512) depuis icon.svg via sharp.
 * Usage : node generate-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

const svgBuffer = readFileSync(join(__dir, 'public', 'icon.svg'))

for (const size of [192, 512]) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(__dir, 'public', `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

console.log('Icônes générées dans public/')
