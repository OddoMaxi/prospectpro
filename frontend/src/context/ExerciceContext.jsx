// Exercice (année) sélectionné en haut de l'application ; filtre tous les écrans.
import { createContext, useContext, useState } from 'react'

const ExerciceContext = createContext(null)
const CURRENT = new Date().getFullYear()

function readStored() {
  try {
    const v = Number(localStorage.getItem('exercice'))
    return v >= 2000 && v <= CURRENT + 1 ? v : CURRENT
  } catch {
    return CURRENT
  }
}

export function ExerciceProvider({ children }) {
  const [annee, setAnneeState] = useState(readStored)
  const setAnnee = a => {
    setAnneeState(a)
    try { localStorage.setItem('exercice', String(a)) } catch { /* stockage indisponible */ }
  }
  const annees = Array.from({ length: 6 }, (_, i) => CURRENT - i)
  return <ExerciceContext.Provider value={{ annee, setAnnee, annees, isCurrent: annee === CURRENT }}>{children}</ExerciceContext.Provider>
}

export const useExercice = () => useContext(ExerciceContext)

const pad = n => String(n).padStart(2, '0')
const lastDay = (y, m) => new Date(y, m, 0).getDate()

// Bornes d'une période dans l'exercice. index : n° du mois (1-12), du trimestre (1-4) ou du semestre (1-2)
export function periodRange(type, annee, index) {
  if (type === 'mois') return { debut: `${annee}-${pad(index)}-01`, fin: `${annee}-${pad(index)}-${lastDay(annee, index)}` }
  if (type === 'trimestre') {
    const m = (index - 1) * 3 + 1
    return { debut: `${annee}-${pad(m)}-01`, fin: `${annee}-${pad(m + 2)}-${lastDay(annee, m + 2)}` }
  }
  if (type === 'semestre') return index === 1 ? { debut: `${annee}-01-01`, fin: `${annee}-06-30` } : { debut: `${annee}-07-01`, fin: `${annee}-12-31` }
  return { debut: `${annee}-01-01`, fin: `${annee}-12-31` }
}

// Index de la période contenant aujourd'hui (ou la dernière de l'exercice s'il est passé)
export function currentIndex(type, annee) {
  const now = new Date()
  const m = annee === now.getFullYear() ? now.getMonth() + 1 : 12
  if (type === 'mois') return m
  if (type === 'trimestre') return Math.ceil(m / 3)
  if (type === 'semestre') return m <= 6 ? 1 : 2
  return 1
}
