import { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import html2canvas from 'html2canvas'
import { Copy, Download, Maximize2 } from 'lucide-react'
import { Btn } from './UI'
import { useToast } from './Toast'

export function QRFullscreen({ show, onClose, url, name, label = 'Please check in for' }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center gap-4">
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none">✕</button>
      <div className="text-white/60 text-sm">{label}</div>
      <div className="text-white text-2xl font-bold text-center px-4">{name}</div>
      <div className="bg-white p-5 rounded-xl">
        <QRCodeSVG value={url} size={280} level="M" />
      </div>
      <div className="text-white/40 text-xs">Scan with your phone camera</div>
    </div>
  )
}

export default function QRCard({ url, name, label = 'Scan to Check-in', preText = 'Please check in for', subText = 'Scan with your phone camera' }) {
  const toast = useToast()
  const [showFS, setShowFS] = useState(false)
  const downloadRef = useRef(null)

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'success')).catch(() => toast('Could not copy', 'error'))
  }

  async function downloadQR() {
    if (!downloadRef.current) return
    const canvas = await html2canvas(downloadRef.current, { scale: 2, backgroundColor: '#ffffff' })
    const a = document.createElement('a')
    a.download = name.replace(/\s+/g, '-') + '-QR.png'
    a.href = canvas.toDataURL('image/png')
    a.click()
    toast('QR downloaded!', 'success')
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
        <div className="text-xs font-medium text-slate-500 mb-3">{label}</div>
        <div className="flex justify-center mb-3">
          <QRCodeSVG value={url} size={160} level="M" />
        </div>
        <div className="flex gap-1.5">
          <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-1 text-xs border border-slate-200 rounded-md py-1.5 hover:bg-slate-50 transition-colors">
            <Copy size={11} /> Copy
          </button>
          <button onClick={downloadQR} className="flex-1 flex items-center justify-center gap-1 text-xs border border-slate-200 rounded-md py-1.5 hover:bg-slate-50 transition-colors">
            <Download size={11} /> Download
          </button>
        </div>
        <button onClick={() => setShowFS(true)} className="w-full flex items-center justify-center gap-1 text-xs border border-slate-200 rounded-md py-1.5 mt-1.5 hover:bg-slate-50 transition-colors">
          <Maximize2 size={11} /> Fullscreen
        </button>
      </div>

      {/* Offscreen download div */}
      <div ref={downloadRef} style={{ position: 'absolute', left: '-9999px', top: 0, background: '#fff', width: 400, padding: 32, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 5 }}>{preText}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#000', marginBottom: 18 }}>{name}</div>
        <div style={{ border: '1px solid #dbeafe', borderRadius: 12, padding: 16, display: 'inline-block', marginBottom: 18 }}>
          <QRCodeSVG value={url} size={220} level="M" />
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>{subText}</div>
        <div style={{ fontSize: 11, color: '#cbd5e1' }}>GatherHQ — Church Attendance</div>
      </div>

      <QRFullscreen show={showFS} onClose={() => setShowFS(false)} url={url} name={name} label={preText} />
    </>
  )
}
