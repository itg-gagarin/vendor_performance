import type { Origin } from '../config/types'
import { dayFromYMD, type Dataset, type GrpoLine, type PoLine, type ReturnLine } from './schema'

// Synthetic, seeded SAP-shaped extract so the platform can be explored before
// the real data is uploaded. Shapes follow OPOR/POR1, OPDN/PDN1 and ORPD/RPD1.

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TREE: Record<string, Record<string, Record<string, string[]>>> = {
  Hardware: {
    Fasteners: { Bolts: ['Hex bolt', 'Flange bolt'], Nuts: ['Hex nut', 'Lock nut'] },
    Tools: { 'Hand tools': ['Wrench set', 'Screwdriver'], 'Power tools': ['Drill bit'] },
  },
  Packaging: {
    Carton: { 'Corrugated box': ['Box 3-ply', 'Box 5-ply'], Divider: ['Carton divider'] },
    Film: { 'Stretch film': ['Stretch film 17 mic'], 'Shrink film': ['Shrink film 25 mic'] },
    Label: { 'Sticker label': ['Barcode label', 'Batch label'] },
  },
  Sparepart: {
    Mechanical: { Bearing: ['Ball bearing', 'Roller bearing'], Seal: ['Oil seal', 'O-ring'] },
    Electrical: { Motor: ['Servo motor'], Sensor: ['Proximity sensor', 'Photo sensor'] },
  },
  Chemical: {
    Solvent: { Alcohol: ['Isopropyl alcohol'], Thinner: ['Lacquer thinner'] },
    Lubricant: { Grease: ['Lithium grease'], Oil: ['Hydraulic oil'] },
  },
  'Raw Material': {
    Resin: { Polyethylene: ['HDPE pellet', 'LDPE pellet'], Polypropylene: ['PP homopolymer'] },
    Metal: { 'Steel sheet': ['Cold rolled sheet'], Aluminium: ['Aluminium coil'] },
  },
}

const NAMES_A = ['Sinar', 'Mitra', 'Karya', 'Jaya', 'Prima', 'Abadi', 'Sentosa', 'Makmur', 'Cahaya', 'Global', 'Indo', 'Surya', 'Bintang', 'Utama', 'Mega', 'Nusantara']
const NAMES_B = ['Teknik', 'Pack', 'Kimia', 'Logam', 'Plastik', 'Sarana', 'Industri', 'Mandiri', 'Perkasa', 'Sejahtera']
const IMPORT_NAMES = ['Shenzhen Hengtai', 'Ningbo Oriental', 'Osaka Kogyo', 'Busan Precision', 'Taipei Fastener', 'Guangzhou Pack', 'Penang Seal', 'Bangkok Chem', 'Hamburg Technik', 'Chennai Metals', 'Kaohsiung Resin', 'Tianjin Bearing']

interface Item {
  code: string
  name: string
  path: [string, string, string, string]
  price: number
}

function buildItems(rand: () => number): Item[] {
  const items: Item[] = []
  let n = 1
  for (const [l1, l2s] of Object.entries(TREE)) {
    for (const [l2, l3s] of Object.entries(l2s)) {
      for (const [l3, l4s] of Object.entries(l3s)) {
        for (const l4 of l4s) {
          const variants = 2 + Math.floor(rand() * 3)
          for (let v = 0; v < variants; v++) {
            items.push({
              code: `${l1.slice(0, 2).toUpperCase()}-${String(n++).padStart(5, '0')}`,
              name: `${l4} ${['S', 'M', 'L', 'XL', 'Std'][v % 5]}`,
              path: [l1, l2, l3, l4],
              price: Math.round((200 + rand() * 9_000) / 50) * 50,
            })
          }
        }
      }
    }
  }
  return items
}

export function buildDemoDataset(seed = 20260930): Dataset {
  const rand = rng(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const normal = () => {
    const u = 1 - rand()
    const v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  const items = buildItems(rand)
  const l1s = Object.keys(TREE)
  const start = dayFromYMD(2025, 1, 2)
  const end = dayFromYMD(2026, 9, 26)

  const po: PoLine[] = []
  const grpo: GrpoLine[] = []
  const returns: ReturnLine[] = []

  let poDocNo = 24_000_001
  let grpoDocNo = 25_000_001
  let prDocNo = 23_000_001
  let retNo = 26_000_001

  const vendorCount = 72
  const usedNames = new Set<string>()
  for (let v = 0; v < vendorCount; v++) {
    const isImport = v % 5 === 0 || v % 11 === 0
    const origin: Origin = isImport ? 'Import' : 'Local'
    let name = ''
    do {
      name = isImport ? `${pick(IMPORT_NAMES)} ${pick(['Co., Ltd', 'Ltd', 'GmbH', 'Pvt Ltd'])}` : `PT ${pick(NAMES_A)} ${pick(NAMES_B)}`
    } while (usedNames.has(name))
    usedNames.add(name)
    const code = `${isImport ? 'VI' : 'VL'}${String(1001 + v)}`
    const group = isImport ? 'Import Supplier' : v % 3 === 0 ? 'Distributor' : v % 3 === 1 ? 'Manufacturer' : 'Local Supplier'

    const cats = [pick(l1s)]
    if (rand() < 0.35) cats.push(pick(l1s))
    const vItems = items.filter((i) => cats.includes(i.path[0])).filter(() => rand() < 0.45)
    if (vItems.length === 0) vItems.push(items.find((i) => i.path[0] === cats[0])!)

    // Vendor behaviour profile
    const baseLead = isImport ? 28 + rand() * 45 : 5 + rand() * 24
    const spread = baseLead * (0.15 + rand() * 0.35)
    const fillBias = rand() < 0.18 ? 0.72 + rand() * 0.2 : 0.97 + rand() * 0.03
    const returnRate = rand() < 0.12 ? 0.05 + rand() * 0.1 : 0
    const volume = Math.max(1, Math.round(Math.exp(1 + rand() * 4.2)))
    const lastActive = rand() < 0.18 ? end - Math.floor(70 + rand() * 250) : end - Math.floor(rand() * 40)
    const firstActive = start + Math.floor(rand() * 200)

    let linesLeft = volume
    while (linesLeft > 0) {
      const poDate = firstActive + Math.floor(rand() * Math.max(1, lastActive - firstActive))
      const prToPo = Math.max(0, Math.round(2 + rand() * (isImport ? 18 : 9)))
      const prDate = poDate - prToPo
      const reqLead = isImport ? 45 + Math.floor(rand() * 60) : 10 + Math.floor(rand() * 30)
      const prRequiredDate = prDate + reqLead
      const poDoc = String(poDocNo++)
      const prDoc = String(prDocNo++)
      const lines = Math.min(linesLeft, 1 + Math.floor(rand() * 4))
      for (let ln = 0; ln < lines; ln++) {
        const item = pick(vItems)
        const qty = Math.round(10 + rand() * 990)
        const price = item.price * (isImport ? 1.6 : 1) * (0.9 + rand() * 0.2)
        const line: PoLine = {
          poDoc,
          poLine: String(ln),
          poDate,
          vendorCode: code,
          vendorName: name,
          vendorGroup: group,
          itemCode: item.code,
          itemName: item.name,
          level1: item.path[0],
          level2: item.path[1],
          level3: item.path[2],
          level4: item.path[3],
          origin,
          qtyOrdered: qty,
          lineValue: Math.round(qty * price),
          openQty: null,
          prDoc,
          prDate: rand() < 0.96 ? prDate : null,
          prRequiredDate: rand() < 0.94 ? prRequiredDate : null,
        }

        // Receipts: lines ordered recently may still be on their way.
        let received = 0
        const lead = Math.max(0, Math.round(baseLead + normal() * spread + (rand() < 0.08 ? baseLead * 0.9 : 0)))
        const firstReceipt = poDate + lead
        if (firstReceipt <= end) {
          const fill = Math.min(1, fillBias + normal() * 0.03)
          const target = Math.max(1, Math.round(qty * fill))
          const split = rand() < 0.2 ? 2 : 1
          for (let s = 0; s < split; s++) {
            const q = s === split - 1 ? target - received : Math.round(target / split)
            const d = firstReceipt + s * Math.round(3 + rand() * 10)
            if (d > end || q <= 0) continue
            const linked = rand() > 0.035
            grpo.push({
              grpoDoc: String(grpoDocNo++),
              grpoLine: '0',
              grpoDate: d,
              vendorCode: code,
              vendorName: name,
              itemCode: item.code,
              qtyReceived: q,
              poDoc: linked ? poDoc : '',
              poLine: linked ? String(ln) : '',
            })
            received += q
            if (rand() < returnRate) {
              returns.push({
                returnDoc: String(retNo++),
                returnDate: d + 2 + Math.floor(rand() * 12),
                vendorCode: code,
                itemCode: item.code,
                qtyReturned: Math.max(1, Math.round(q * (0.05 + rand() * 0.3))),
              })
            }
          }
        }
        line.openQty = Math.max(0, qty - received)
        po.push(line)
      }
      linesLeft -= lines
    }
  }

  return { po, grpo, returns, source: 'Demo data (synthetic)', loadedAt: new Date().toISOString(), isDemo: true }
}
