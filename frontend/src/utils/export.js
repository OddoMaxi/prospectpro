// Exports Excel et PDF des listes et rapports.
// columns : [{ label, value: 'cle' | (row) => any, type: 'money' | 'number' | 'date' | 'pct' | 'text' }]
import { fmtMoney, fmtNum, fmtDate, fmtPct, today } from './format'

// Bibliothèques chargées à la demande pour ne pas alourdir le chargement initial
export async function pdfLibs() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable }
}

const read = (row, c) => (typeof c.value === 'function' ? c.value(row) : row[c.value])

export async function exportExcel({ filename, columns, rows, sheet = 'Export' }) {
  const header = columns.map(c => ({ value: c.label, fontWeight: 'bold', backgroundColor: '#E5E7EB' }))
  const body = rows.map(r => columns.map(c => {
    const v = read(r, c)
    if (v === null || v === undefined || v === '') return null
    if (c.type === 'money') return { value: Math.round(Number(v) || 0), type: Number, format: '#,##0 "GNF"' }
    if (c.type === 'number') return { value: Number(v) || 0, type: Number, format: '#,##0' }
    if (c.type === 'pct') return { value: Number(v) / 100, type: Number, format: '0.0%' }
    if (c.type === 'date') return { value: fmtDate(v), type: String }
    return { value: String(v), type: String }
  }))
  const { default: writeXlsxFile } = await import('write-excel-file')
  await writeXlsxFile([header, ...body], {
    fileName: `${filename}_${today()}.xlsx`,
    sheet,
    columns: columns.map(c => ({ width: c.width || (c.type === 'money' ? 18 : 20) })),
  })
}

export function cellText(v, type) {
  if (v === null || v === undefined || v === '') return ''
  if (type === 'money') return fmtMoney(v)
  if (type === 'number') return fmtNum(v)
  if (type === 'date') return fmtDate(v)
  if (type === 'pct') return fmtPct(v)
  return String(v)
}

export async function newPdf(orientation = 'portrait') {
  const { jsPDF } = await pdfLibs()
  return new jsPDF({ orientation, unit: 'mm', format: 'a4' })
}

export function pdfHeader(doc, title, subtitle) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text([subtitle, `Édité le ${fmtDate(today())}`].filter(Boolean), 14, 22)
  doc.setTextColor(0)
  return subtitle ? 32 : 28
}

export async function exportPdf({ filename, title, subtitle, columns, rows, totals, orientation }) {
  const { autoTable } = await pdfLibs()
  const doc = await newPdf(orientation || (columns.length > 6 ? 'landscape' : 'portrait'))
  const y = pdfHeader(doc, title, subtitle)
  autoTable(doc, {
    startY: y,
    head: [columns.map(c => c.label)],
    body: rows.map(r => columns.map(c => cellText(read(r, c), c.type))),
    foot: totals ? [columns.map((c, i) => (i === 0 ? 'Total' : totals[c.label] !== undefined ? cellText(totals[c.label], c.type) : ''))] : undefined,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, ['money', 'number', 'pct'].includes(c.type) ? { halign: 'right' } : {}])),
  })
  doc.save(`${filename}_${today()}.pdf`)
}
