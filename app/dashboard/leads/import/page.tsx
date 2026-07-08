// app/dashboard/leads/import/page.tsx
// CRM import — drag/drop CSV upload with field mapping preview.
'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

const TEMPLATE_HEADERS = 'contact_name,contact_email,contact_phone,property_address,contact_city,contact_state,contact_zip,lead_source,notes'
const TEMPLATE_ROW     = 'John Smith,john@example.com,555-0100,123 Oak St,Tampa,FL,33601,Door Knock,'

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS, TEMPLATE_ROW].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = 'proguild-import-template.csv'; a.click()
}

export default function ImportPage() {
  const router = useRouter()
  const [file,      setFile]     = useState<File|null>(null)
  const [preview,   setPreview]  = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result,    setResult]   = useState<{imported:number;skipped:number;errors?:string[]}|null>(null)
  const [err,       setErr]      = useState<string|null>(null)

  const onFile = useCallback((f: File) => {
    setFile(f); setResult(null); setErr(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const lines = text.trim().split(/\r?\n/).slice(0, 6)
      setPreview(lines.map(l => l.split(',').map(c => c.replace(/^"|"$/g,'').trim())))
    }
    reader.readAsText(f)
  }, [])

  async function doImport() {
    if (!file) return
    setImporting(true); setErr(null)
    const form = new FormData(); form.append('file', file)
    const r = await apiFetch('/api/leads/import', { method: 'POST', body: form })
    const d = await r.json()
    if (!r.ok) { setErr(d.error ?? 'Import failed'); setImporting(false); return }
    setResult(d); setImporting(false)
  }

  const T = { teal:'#0F766E', navy:'#0A1628', sub:'#64748B', border:'#E2E8F0', bg:'#F8FAFC', card:'#fff' }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ maxWidth:680, margin:'0 auto', padding:'32px 16px 60px' }}>

        {/* Header */}
        <button onClick={()=>router.back()} style={{ background:'none', border:'none', color:T.sub, fontSize:13, cursor:'pointer', marginBottom:16, padding:0 }}>← Back</button>
        <h1 style={{ fontSize:24, fontWeight:800, color:T.navy, margin:'0 0 4px', letterSpacing:'-0.02em' }}>Import Leads</h1>
        <p style={{ fontSize:13.5, color:T.sub, marginBottom:28 }}>Upload a CSV from JobNimbus, Roofr, or any spreadsheet. Up to 500 leads per file.</p>

        {/* Template download */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13.5, fontWeight:700, color:T.navy }}>Need a template?</div>
            <div style={{ fontSize:12, color:T.sub, marginTop:2 }}>Download our CSV format with all supported columns</div>
          </div>
          <button onClick={downloadTemplate}
            style={{ background:T.teal, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' as const }}>
            ↓ Template
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault()}}
          onDrop={e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) onFile(f)}}
          style={{ border:`2px dashed ${file?T.teal:T.border}`, borderRadius:14, padding:'32px 20px', textAlign:'center', marginBottom:20, cursor:'pointer',
            background: file ? (T.teal+'10') : T.card, transition:'all 0.15s' }}
          onClick={()=>document.getElementById('csv-input')?.click()}>
          <input id="csv-input" type="file" accept=".csv,.txt" style={{ display:'none' }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f) }} />
          <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
          <div style={{ fontSize:14, fontWeight:700, color: file?T.teal:T.navy }}>
            {file ? file.name : 'Drop CSV here or click to browse'}
          </div>
          {!file && <div style={{ fontSize:12, color:T.sub, marginTop:4 }}>Supports .csv files up to 500 rows</div>}
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:20 }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, fontSize:11, fontWeight:800, color:T.sub, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              Preview (first {Math.min(preview.length-1, 5)} rows)
            </div>
            <div style={{ overflowX:'auto' as const }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#F8FAFC' }}>
                    {preview[0]?.map((h,i) => (
                      <th key={i} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, color:T.sub, borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(1,6).map((row,ri) => (
                    <tr key={ri} style={{ borderBottom:`1px solid ${T.border}` }}>
                      {row.map((cell,ci) => (
                        <td key={ci} style={{ padding:'8px 12px', color:T.navy }}>{cell || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ background: result.imported>0 ? '#F0FDFA' : '#FEF2F2', border:`1px solid ${result.imported>0 ? '#99F6E4':'#FECACA'}`, borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
            <div style={{ fontSize:16, fontWeight:800, color: result.imported>0 ? T.teal:'#DC2626', marginBottom:6 }}>
              {result.imported>0 ? `✓ ${result.imported} lead${result.imported!==1?'s':''} imported` : 'Import failed'}
            </div>
            {result.skipped>0 && <div style={{ fontSize:13, color:T.sub }}>{result.skipped} rows skipped (missing name or error)</div>}
            {result.errors?.slice(0,5).map((e,i) => (
              <div key={i} style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>{e}</div>
            ))}
            {result.imported>0 && (
              <button onClick={()=>router.push('/dashboard/pipeline')}
                style={{ marginTop:12, background:T.teal, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                View leads →
              </button>
            )}
          </div>
        )}

        {err && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#DC2626' }}>{err}</div>}

        {/* Import button */}
        {file && !result && (
          <button onClick={doImport} disabled={importing}
            style={{ width:'100%', padding:'14px', background:T.teal, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:importing?'default':'pointer', opacity:importing?0.7:1 }}>
            {importing ? 'Importing…' : `Import ${file.name}`}
          </button>
        )}

      </div>
    </div>
  )
}
