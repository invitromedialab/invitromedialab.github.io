// Simple dev server for vitroscape-web
// Run: node server.js
// Then open: http://localhost:3000

const http = require('http')
const fs   = require('fs')
const path = require('path')

const PORT = 3000
const ROOT = __dirname

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
}

http.createServer((req, res) => {
  // ── Save kali params ──────────────────────────────
  if (req.method === 'POST' && req.url === '/save-kali') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        JSON.parse(body) // validate JSON before writing
        fs.writeFileSync(path.join(ROOT, 'kali_params.json'), body, 'utf8')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(400); res.end('invalid JSON')
      }
    })
    return
  }

  // ── Static file serving ───────────────────────────
  const url      = req.url.split('?')[0]
  const filePath = path.join(ROOT, url === '/' ? 'index.html' : url)

  // Stay inside ROOT (basic path traversal guard)
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return
  }

  const ext     = path.extname(filePath).toLowerCase()
  const mime    = MIME[ext] || 'application/octet-stream'
  const stat    = fs.statSync(filePath)
  const total   = stat.size

  // Range support for video
  if (req.headers.range && mime.startsWith('video/')) {
    const [startStr, endStr] = req.headers.range.replace('bytes=', '').split('-')
    const start = parseInt(startStr, 10)
    const end   = endStr ? parseInt(endStr, 10) : total - 1
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   mime,
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': total })
    fs.createReadStream(filePath).pipe(res)
  }

}).listen(PORT, '127.0.0.1', () => {
  console.log(`vitroscape dev server → http://localhost:${PORT}`)
})
