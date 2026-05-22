export function exportCSV(rows, columns, filename) {
  const header = columns.map(c => c.label)
  const body = rows.map(r =>
    columns.map(c => {
      const val = typeof c.value === 'function' ? c.value(r) : r[c.value]
      return `"${String(val ?? '').replace(/"/g, '""')}"`
    })
  )
  const csv = [header.join(';'), ...body.map(r => r.join(';'))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
