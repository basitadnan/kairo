/* eslint-disable */
/**
 * Generates the Kairo launcher icons — no external dependencies.
 *
 * The mark is an abstract minimal clock face (Soft Editorial palette):
 *   sage ring + charcoal hour/minute hands at 10:10 + sage centre dot,
 * rendered with signed-distance fields and 3x3 supersampled anti-aliasing.
 *
 * Outputs (into android/app/src/main/res and build/):
 *   mipmap-(mdpi…xxxhdpi)/ic_launcher.png            48–192 px
 *   mipmap-(mdpi…xxxhdpi)/ic_launcher_round.png
 *   mipmap-(mdpi…xxxhdpi)/ic_launcher_foreground.png 108–432 px
 *   build/icon.png (512) + build/icon.ico (256, PNG-embedded)
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const BUILD = path.join(__dirname, '..', 'build')

const BONE = [0xf7, 0xf6, 0xf3]
const CHARCOAL = [0x2a, 0x2a, 0x28]
const SAGE = [0x57, 0x65, 0x3f]

/* ------------------------------- PNG writer ------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba: Uint8Array length w*h*4 */
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy ? raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
      : null
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png
}

/* --------------------------- SDF shape rendering -------------------------- */

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r
}
function sdRing(px, py, cx, cy, r, halfW) {
  return Math.abs(Math.hypot(px - cx, py - cy) - r) - halfW
}
function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay
  const apx = px - ax, apy = py - ay
  const t = clamp01((apx * abx + apy * aby) / (abx * abx + aby * aby))
  return Math.hypot(apx - abx * t, apy - aby * t)
}
function sdRoundRect(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - hx + r
  const qy = Math.abs(py - cy) - hy + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/** Point the hand at `degFrom12` (clockwise), starting at centre, length len. */
function handEnd(cx, cy, degFrom12, len) {
  const rad = ((degFrom12 - 90) * Math.PI) / 180 // 0° = up
  return [cx + len * Math.cos(rad), cy + len * Math.sin(rad)]
}

/**
 * Render the Kairo mark into an S×S RGBA buffer.
 * scale k shrinks the whole mark around centre (for the adaptive foreground).
 * bg: null → transparent; or [r,g,b] flat fill. tile: 'square' | 'round' | null
 */
function renderMark(S, { scale = 1, bg = null, tile = null } = {}) {
  const rgba = Buffer.alloc(S * S * 4)
  const c = S / 2
  const k = scale

  // Mark geometry (base proportions at scale 1: ring outer R = 0.30S)
  const ringR = 0.3 * S * k
  const ringW = 0.052 * S * k // half-thickness → stroke ≈ 10% of canvas at k=1… softened
  const hourEnd = handEnd(c, c, -50, 0.165 * S * k)
  const minEnd = handEnd(c, c, 50, 0.245 * S * k)
  const hourHW = 0.030 * S * k
  const minHW = 0.024 * S * k
  const dotR = 0.034 * S * k

  const SS = 3 // supersample grid per axis
  const px = 1 / SS

  // Tile masks
  const tileRadius = 0.225 * S

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let covBg = bg ? 1 : 0
      if (tile === 'square') {
        const dTile = sdRoundRect(x + 0.5, y + 0.5, c, c, c - 0.5, c - 0.5, tileRadius)
        covBg = smooth(0.75, -0.75, dTile)
      } else if (tile === 'round') {
        const dTile = sdCircle(x + 0.5, y + 0.5, c, c, c - 0.5)
        covBg = smooth(0.75, -0.75, dTile)
      }

      // Supersampled mark coverage
      let covRing = 0, covHour = 0, covMin = 0, covDot = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const sxp = x + (sx + 0.5) * px
          const syp = y + (sy + 0.5) * px
          covRing += smooth(px, -px, sdRing(sxp, syp, c, c, ringR, ringW))
          covHour += smooth(px, -px, sdSegment(sxp, syp, c, c, hourEnd[0], hourEnd[1]) - hourHW)
          covMin += smooth(px, -px, sdSegment(sxp, syp, c, c, minEnd[0], minEnd[1]) - minHW)
          covDot += smooth(px, -px, sdCircle(sxp, syp, c, c, dotR))
        }
      }
      const n = SS * SS
      covRing /= n; covHour /= n; covMin /= n; covDot /= n

      // Composite: bg ← ring(sage) ← hands(charcoal) ← dot(sage)
      let r = bg ? bg[0] : 0, g = bg ? bg[1] : 0, b = bg ? bg[2] : 0
      let a = covBg * (bg ? 255 : 0)

      const blend = (cov, col) => {
        r = r * (1 - cov) + col[0] * cov
        g = g * (1 - cov) + col[1] * cov
        b = b * (1 - cov) + col[2] * cov
        a = a * (1 - cov) + 255 * cov
      }
      blend(covRing, SAGE)
      blend(Math.max(covHour, covMin), CHARCOAL)
      blend(covDot, SAGE)

      const i = (y * S + x) * 4
      rgba[i] = Math.round(r); rgba[i + 1] = Math.round(g); rgba[i + 2] = Math.round(b); rgba[i + 3] = Math.round(a)
    }
  }
  return rgba
}

/* ---------------------------------- emit ---------------------------------- */

const DENSITIES = [
  ['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4],
]

function writeRel(rel, buffer) {
  const file = path.join(RES, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buffer)
  console.log('✓', path.relative(process.cwd(), file))
}

for (const [dpi, mult] of DENSITIES) {
  const size = Math.round(48 * mult)
  const dir = `mipmap-${dpi}`
  writeRel(`${dir}/ic_launcher.png`, encodePng(size, size, renderMark(size, { bg: BONE, tile: 'square' })))
  writeRel(`${dir}/ic_launcher_round.png`, encodePng(size, size, renderMark(size, { bg: BONE, tile: 'round' })))
  const fgSize = Math.round(108 * mult)
  writeRel(`${dir}/ic_launcher_foreground.png`, encodePng(fgSize, fgSize, renderMark(fgSize, { scale: 0.64 })))
}

fs.mkdirSync(BUILD, { recursive: true })
const icon512 = encodePng(512, 512, renderMark(512, { bg: BONE, tile: 'square' }))
fs.writeFileSync(path.join(BUILD, 'icon.png'), icon512)
console.log('✓ build/icon.png')

const png256 = encodePng(256, 256, renderMark(256, { bg: BONE, tile: 'square' }))
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // count
header[6] = 0 // width 256 → 0
header[7] = 0 // height 256 → 0
header[8] = 0 // colours
header[9] = 0 // reserved
header.writeUInt16LE(1, 10) // planes
header.writeUInt16LE(32, 12) // bpp
header.writeUInt32LE(png256.length, 14)
header.writeUInt32LE(22, 18)
fs.writeFileSync(path.join(BUILD, 'icon.ico'), Buffer.concat([header, png256]))
console.log('✓ build/icon.ico')
