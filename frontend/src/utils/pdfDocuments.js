// Documents PDF de commission : facture mensuelle et reçu de tranche
import { newPdf, pdfHeader, pdfLibs } from './export'
import { fmtMoney, fmtDate, fmtMois, fmtRate, personName, MODES_PAIEMENT, NATURES_LIGNE, ROLES_LIGNE, STATUTS_FACTURE } from './format'

const ENTREPRISE = 'ProspectPro – Assurance'

export async function facturePdf(f) {
  const { autoTable } = await pdfLibs()
  const doc = await newPdf('landscape')
  let y = pdfHeader(doc, `Facture de commissions ${f.numero}`, `${ENTREPRISE} · ${fmtMois(f.mois)}`)
  doc.setFontSize(10)
  doc.text([
    `Agent : ${personName(f, 'agent_')} (${f.agent_username})`,
    `Statut : ${STATUTS_FACTURE[f.statut]?.label || f.statut}`,
  ], 14, y)
  y += 12

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Contrat', 'Client', 'Type', 'Nature', 'Part', 'Prime de base', 'Taux', 'Montant']],
    body: f.lignes.map(l => [
      fmtDate(l.date_acquisition),
      l.numero_contrat || '—',
      l.client_nom ? personName(l, 'client_') : '—',
      l.operation === 'renouvellement' ? 'Renouvellement' : l.operation === 'souscription' ? 'Souscription' : '—',
      NATURES_LIGNE[l.nature] || l.nature,
      ROLES_LIGNE[l.role] || '—',
      l.base ? fmtMoney(l.base) : '—',
      l.taux ? fmtRate(l.taux) : '—',
      fmtMoney(l.montant),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  })

  y = doc.lastAutoTable.finalY + 6
  const st = f.sous_totaux || {}
  const resume = [
    ['Commissions classiques', fmtMoney(st.commission)],
    ['Primes de performance', fmtMoney(st.performance)],
    ...(st.retrocession ? [['Rétrocessions', fmtMoney(st.retrocession)]] : []),
    ...(st.ajustement ? [['Ajustements', fmtMoney(st.ajustement)]] : []),
    ['Total de la facture', fmtMoney(f.total)],
    ['Déjà payé', fmtMoney(f.total_paye)],
    ['Reste à payer', fmtMoney(f.reste)],
  ]
  autoTable(doc, {
    startY: y, margin: { left: 180 }, body: resume, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  })

  if (f.paiements?.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Reçu', 'Date', 'Mode', 'Référence', 'Montant']],
      body: f.paiements.map(p => [p.numero_recu, fmtDate(p.date_paiement), MODES_PAIEMENT[p.mode] || p.mode, p.reference || '—', fmtMoney(p.montant)]),
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [16, 185, 129] },
      columnStyles: { 4: { halign: 'right' } },
    })
  }
  doc.save(`facture_${f.numero}.pdf`)
}

export async function recuPdf(r) {
  const { autoTable } = await pdfLibs()
  const f = r.facture
  const doc = await newPdf('portrait')
  let y = pdfHeader(doc, `Reçu de paiement ${r.numero_recu}`, ENTREPRISE)
  autoTable(doc, {
    startY: y, theme: 'grid',
    body: [
      ['Bénéficiaire', f.agent_label],
      ['Facture', `${f.numero} – ${fmtMois(f.mois)}`],
      ['Date du paiement', fmtDate(r.date_paiement)],
      ['Mode de paiement', MODES_PAIEMENT[r.mode] || r.mode],
      ['Référence', r.reference || '—'],
      ['Montant de la tranche', fmtMoney(r.montant)],
      ['Total de la facture', fmtMoney(f.total)],
      ['Cumul versé à ce jour', fmtMoney(r.cumul_paye)],
      ['Reste à payer', fmtMoney(r.reste_apres)],
      ['Enregistré par', `${r.created_by_prenom || ''} ${r.created_by_nom || ''}`.trim() || '—'],
    ],
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'left' } },
  })
  y = doc.lastAutoTable.finalY + 25
  doc.setFontSize(9)
  doc.text('Signature de l\'agent', 20, y)
  doc.text('Signature de l\'administration', 120, y)
  doc.save(`recu_${r.numero_recu}.pdf`)
}
