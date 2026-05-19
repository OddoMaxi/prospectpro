import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce((acc, n, idx, arr) => {
      if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…')
      acc.push(n)
      return acc
    }, [])

  return (
    <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
      <span className="text-xs text-gray-500">
        Page {page} / {totalPages} · {total} résultat(s)
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={page === 1}
          className="btn btn-secondary btn-sm disabled:opacity-40" title="Première page">«</button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
          className="btn btn-secondary btn-sm disabled:opacity-40" title="Précédente">
          <ChevronLeft size={14} />
        </button>
        {pages.map((n, i) =>
          n === '…'
            ? <span key={`e${i}`} className="px-1 text-gray-400 text-xs">…</span>
            : <button key={n} onClick={() => onPageChange(n)}
                className={`btn btn-sm min-w-[32px] ${n === page ? 'btn-primary' : 'btn-secondary'}`}>{n}</button>
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
          className="btn btn-secondary btn-sm disabled:opacity-40" title="Suivante">
          <ChevronRight size={14} />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
          className="btn btn-secondary btn-sm disabled:opacity-40" title="Dernière page">»</button>
      </div>
    </div>
  )
}
