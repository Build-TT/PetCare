// Google Sheets rejects a cell whose text exceeds ~50,000 characters, and a
// full-resolution phone photo encoded as a base64 data URL blows past that
// easily. compressPhotoToDataUrl re-encodes a photo as a smaller/lower
// quality JPEG data URL, walking a fixed ladder of (dimension, quality)
// attempts until one is small enough, so a Sheet save never fails on photo
// size alone.
const LADDER = [
  [512, 0.85],
  [512, 0.7],
  [384, 0.7],
  [384, 0.55],
  [256, 0.55],
  [256, 0.4],
]

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('อ่านไฟล์รูปไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'))
    if (typeof source === 'string') {
      image.src = source
    } else {
      image.src = URL.createObjectURL(source)
    }
  })
}

// Default render: decode the source into an <img>, scale its longest edge
// down to maxDimension (never upscaling), and re-encode via canvas.
async function defaultRender(source, maxDimension, quality) {
  const image = await loadImageElement(source)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const longestEdge = Math.max(width, height) || 1
  const scale = Math.min(1, maxDimension / longestEdge)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas ไม่พร้อมใช้งานในอุปกรณ์นี้')
  // JPEG has no alpha channel, so a transparent PNG would flatten onto the
  // canvas default (transparent black) and come back with a black background.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(image, 0, 0, targetWidth, targetHeight)
  return canvas.toDataURL('image/jpeg', quality)
}

// Falls back to the original photo unchanged when nothing can be rendered:
// a data-URL source is returned as-is, a File/Blob source is read verbatim
// via FileReader so the caller still gets a usable data URL.
async function passThrough(source) {
  if (typeof source === 'string') return source
  try {
    return await readFileAsDataUrl(source)
  } catch {
    return ''
  }
}

export async function compressPhotoToDataUrl(source, { maxChars = 40000, render = defaultRender } = {}) {
  const attempts = []
  for (const [maxDimension, quality] of LADDER) {
    let dataUrl
    try {
      dataUrl = await render(source, maxDimension, quality)
    } catch {
      // Treat any render failure (no canvas, decode error, ...) as the
      // environment being unable to compress at all rather than retrying
      // further ladder rungs that would fail the same way.
      return passThrough(source)
    }
    if (typeof dataUrl !== 'string' || !dataUrl) continue
    attempts.push(dataUrl)
    if (dataUrl.length <= maxChars) return dataUrl
  }
  if (!attempts.length) return passThrough(source)
  return attempts.reduce((smallest, current) => (current.length < smallest.length ? current : smallest))
}
