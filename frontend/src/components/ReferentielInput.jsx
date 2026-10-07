// Saisie libre avec autocomplétion tolérante aux fautes (Profession, Secteur d'activité).
// À la sortie du champ, la correction automatique éventuelle est appliquée et signalée (« Corrigé en : … »).
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export default function ReferentielInput({ type, value, onChange, placeholder }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState(null)
  const [active, setActive] = useState(-1)
  const timer = useRef(null)
  const box = useRef(null)

  useEffect(() => {
    const close = e => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const search = q => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      api.get(`/referentiels/${type}/suggestions`, { params: { q } }).then(r => { setItems(r.data); setActive(-1) }).catch(() => {})
    }, 200)
  }

  const choose = v => { onChange(v); setHint(null); setOpen(false) }

  const resolve = async () => {
    if (!value?.trim()) return setHint(null)
    try {
      const r = await api.get(`/referentiels/${type}/resoudre`, { params: { q: value } })
      if (r.data.corrige && r.data.valeur !== value) { onChange(r.data.valeur); setHint({ kind: 'corrige', text: `Corrigé en : ${r.data.valeur}` }) }
      else if (r.data.nouveau) setHint({ kind: 'nouveau', text: 'Nouvelle valeur : elle sera soumise à validation de l\'administrateur' })
      else setHint(null)
    } catch { /* l'enregistrement fera la résolution */ }
  }

  const onKey = e => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active].valeur) }
  }

  return (
    <div className="relative" ref={box}>
      <input className="input" value={value} placeholder={placeholder} autoComplete="off"
        onChange={e => { onChange(e.target.value); setHint(null); setOpen(true); search(e.target.value) }}
        onFocus={() => { setOpen(true); search(value || '') }}
        onBlur={() => setTimeout(() => { if (!box.current?.contains(document.activeElement)) resolve() }, 150)}
        onKeyDown={onKey} />
      {open && items.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {items.map((it, i) => (
            <button type="button" key={it.valeur} onMouseDown={e => e.preventDefault()} onClick={() => choose(it.valeur)}
              className={`w-full text-left px-3 py-2 text-sm flex justify-between ${i === active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
              <span>{it.valeur}</span>
              {it.statut === 'a_valider' && <span className="text-[10px] text-amber-600">à valider</span>}
            </button>
          ))}
        </div>
      )}
      {hint && <p className={`text-xs mt-1 ${hint.kind === 'corrige' ? 'text-emerald-600' : 'text-amber-600'}`}>{hint.text}</p>}
    </div>
  )
}
