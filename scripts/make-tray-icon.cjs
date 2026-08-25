// One-shot generator for electron/tray-icon.png (32x32 sage clock mark).
// Run: node scripts/make-tray-icon.cjs
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const W = 32
const H = 32

// Soft Editorial palette: sage accent + bone highlight
const BG = [87, 101, 63, 255] // #57653F
const FG = [235, 240, 227, 255] // #EBF0E3

function insideRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false
  const cx = Math.min(x, w - 1 - x)
  const cy = Math.min(y, h - 1 - y)
  if (cx >= r || cy >= r) return true
  const dx = r - 1 - cx
  const dy = r - 1 - cy
  return dx * dx + dy * dy <= r * r
}

const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4)
  raw[rowStart] = 0 // filter: none
  for (let x = 0; x < W; x++) {
    let px = [0, 0, 0, 0]
    if (insideRoundedRect(x, y, W, H, 8)) {
      px = BG
      // Clock face: ring + hands centred at (15.5, 15.5)
      const dx = x - 15.5
      const dy = y - 15.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const onRing = dist <= 11 && dist >= 8.5
      const onHandVertical = Math.abs(dx) <= 0.8 && dy <= 5.5 && dy >= -6.5
      const onHandHorizontal = Math.abs(dy) <= 0.8 && dx >= -1.5 && dx <= 5.5
      if (onRing || onHandVertical || onHandHorizontal) px = FG
    }
    const o = rowStart + 1 + x * 4
    raw[o] = px[0]
    raw[o + 1] = px[1]
    raw[o + 2] = px[2]
    raw[o + 3] = px[3]
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  crc = (crc ^ 0xffffffff) >>> 0
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc)
  return Buffer.concat([len, body, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const out = path.join(__dirname, '..', 'electron', 'tray-icon.png')
fs.writeFileSync(out, png)
console.log('wrote', out, png.length, 'bytes')
