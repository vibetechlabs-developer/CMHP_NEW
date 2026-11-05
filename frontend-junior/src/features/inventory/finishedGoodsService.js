/**
 * finishedGoodsService.js
 *
 * Finished Goods (FG) Warehouse & Free Buffer Stock Management
 * Manages commercial finished medicine units produced in excess of immediate sales orders
 * (e.g. producing 1,500 units for a 1,000 order = 500 FG buffer units in warehouse store).
 *
 * Tracks:
 *  - Available FG buffer stock available for immediate dispatch to next incoming orders
 *  - Full traceability: Batch No., Mfg Date, Exp Date, Linked previous/new sales orders
 */

const FG_STORAGE_KEY = 'cmhp_fg_buffer_inventory_v1'

const DEFAULT_FG_STOCK = [
  {
    id: 'fg-001',
    batchNo: 'AH2602',
    productCode: 'FLX-01',
    productName: 'Flexicare Drops',
    packSize: '30 ml',
    batchVolumeLtr: 90,
    grossProducedBottles: 3000,
    sampleDeductedBottles: 10,
    netCommercialBottles: 2990,
    initialBufferQty: 490,
    availableBufferQty: 490,
    allocatedQty: 2500,
    allocatedOrders: [
      { orderRef: 'SO-2026-0412-APEX', customer: 'APEX Health', qty: 2500, date: '2026-04-12' },
    ],
    mfgDate: '2026-04-12',
    expDate: '2028-04-11',
    warehouseStore: 'FG Warehouse - Bay 4 (Cold Chain Ambient)',
    status: 'AVAILABLE', // 'AVAILABLE' | 'PARTIALLY_ALLOCATED' | 'DEPLETED'
    inwardedAt: '2026-04-12T16:00:00.000Z',
  },
  {
    id: 'fg-002',
    batchNo: 'FB2603',
    productCode: 'FB-02',
    productName: 'Fibrogone Drops',
    packSize: '30 ml',
    batchVolumeLtr: 60,
    grossProducedBottles: 2000,
    sampleDeductedBottles: 10,
    netCommercialBottles: 1990,
    initialBufferQty: 500,
    availableBufferQty: 500,
    allocatedQty: 1490,
    allocatedOrders: [
      { orderRef: 'SO-2026-0518-MED', customer: 'Medlife Pharma', qty: 1490, date: '2026-05-18' },
    ],
    mfgDate: '2026-05-18',
    expDate: '2028-05-17',
    warehouseStore: 'FG Warehouse - Rack FG-02',
    status: 'AVAILABLE',
    inwardedAt: '2026-05-18T17:30:00.000Z',
  },
  {
    id: 'fg-003',
    batchNo: 'PR2601',
    productCode: 'PCM-01',
    productName: 'Paracetamol Drops',
    packSize: '15 ml',
    batchVolumeLtr: 30,
    grossProducedBottles: 1500,
    sampleDeductedBottles: 10,
    netCommercialBottles: 1490,
    initialBufferQty: 490,
    availableBufferQty: 190,
    allocatedQty: 1300,
    allocatedOrders: [
      { orderRef: 'SO-2026-0110-ORIGINAL', customer: 'Apollo Hospitals', qty: 1000, date: '2026-01-10' },
      { orderRef: 'SO-2026-0305-DISPATCH', customer: 'City Clinic', qty: 300, date: '2026-03-05' },
    ],
    mfgDate: '2026-01-10',
    expDate: '2028-01-09',
    warehouseStore: 'FG Warehouse - Rack FG-01',
    status: 'PARTIALLY_ALLOCATED',
    inwardedAt: '2026-01-10T12:00:00.000Z',
  },
]

function getStoredFg() {
  try {
    const raw = localStorage.getItem(FG_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(FG_STORAGE_KEY, JSON.stringify(DEFAULT_FG_STOCK))
      return DEFAULT_FG_STOCK
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : DEFAULT_FG_STOCK
  } catch {
    return DEFAULT_FG_STOCK
  }
}

function saveStoredFg(items) {
  try {
    localStorage.setItem(FG_STORAGE_KEY, JSON.stringify(items))
  } catch (e) {
    console.warn('[finishedGoodsService] Failed to persist FG stock:', e)
  }
}

export const finishedGoodsService = {
  /**
   * List all Finished Goods buffer batches in warehouse
   */
  listStock: async ({ search = '', status = 'ALL' } = {}) => {
    let items = getStoredFg()

    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (fg) =>
          fg.batchNo.toLowerCase().includes(q) ||
          fg.productName.toLowerCase().includes(q) ||
          fg.productCode.toLowerCase().includes(q) ||
          (fg.warehouseStore && fg.warehouseStore.toLowerCase().includes(q))
      )
    }

    if (status !== 'ALL') {
      items = items.filter((fg) => fg.status === status)
    }

    return items
  },

  /**
   * Inward newly produced buffer bottles into Finished Goods store
   */
  inwardBufferStock: async (payload) => {
    const items = getStoredFg()
    const id = `fg-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    const initialBuffer = Number(payload.bufferQty) || 0
    const newEntry = {
      id,
      batchNo: payload.batchNo || 'AH-NEW',
      productCode: payload.productCode || 'PROD',
      productName: payload.productName || 'Finished Medicine',
      packSize: payload.packSize || '30 ml',
      batchVolumeLtr: Number(payload.batchVolumeLtr) || 0,
      grossProducedBottles: Number(payload.grossProducedBottles) || initialBuffer,
      sampleDeductedBottles: Number(payload.sampleDeductedBottles) || 0,
      netCommercialBottles: Number(payload.netCommercialBottles) || initialBuffer,
      initialBufferQty: initialBuffer,
      availableBufferQty: initialBuffer,
      allocatedQty: Number(payload.initialOrderAllocatedQty) || 0,
      allocatedOrders: payload.linkedSalesOrder
        ? [
            {
              orderRef: payload.linkedSalesOrder,
              customer: payload.customerName || 'Direct Sales Order',
              qty: Number(payload.initialOrderAllocatedQty) || 0,
              date: new Date().toISOString().split('T')[0],
            },
          ]
        : [],
      mfgDate: payload.mfgDate || new Date().toISOString().split('T')[0],
      expDate:
        payload.expDate ||
        new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      warehouseStore: payload.warehouseStore || 'FG Warehouse - General Storage Bay',
      status: initialBuffer > 0 ? 'AVAILABLE' : 'DEPLETED',
      inwardedAt: new Date().toISOString(),
    }

    items.unshift(newEntry)
    saveStoredFg(items)
    return newEntry
  },

  /**
   * Allocate available buffer bottles to a new incoming Sales Order
   */
  allocateToSalesOrder: async (fgId, { orderRef, customerName, allocateQty }) => {
    const items = getStoredFg()
    const idx = items.findIndex((f) => f.id === fgId)
    if (idx === -1) throw new Error('Finished goods record not found')

    const fg = items[idx]
    const qtyToAllocate = Math.min(fg.availableBufferQty, Math.max(1, Number(allocateQty) || 0))
    if (qtyToAllocate <= 0) throw new Error('No available stock to allocate')

    const newAvailable = fg.availableBufferQty - qtyToAllocate
    const newAllocated = fg.allocatedQty + qtyToAllocate

    fg.availableBufferQty = newAvailable
    fg.allocatedQty = newAllocated
    fg.status = newAvailable === 0 ? 'DEPLETED' : 'PARTIALLY_ALLOCATED'
    fg.allocatedOrders = fg.allocatedOrders || []
    fg.allocatedOrders.push({
      orderRef: orderRef || `SO-${Date.now()}`,
      customer: customerName || 'Direct Customer',
      qty: qtyToAllocate,
      date: new Date().toISOString().split('T')[0],
    })

    items[idx] = fg
    saveStoredFg(items)
    return fg
  },

  /**
   * Return high-level FG inventory metrics
   */
  getMetrics: async () => {
    const items = getStoredFg()
    const totalBufferBottles = items.reduce((acc, i) => acc + (Number(i.availableBufferQty) || 0), 0)
    const totalAllocatedBottles = items.reduce((acc, i) => acc + (Number(i.allocatedQty) || 0), 0)
    const activeBatchesCount = items.filter((i) => i.availableBufferQty > 0).length

    return {
      activeBatchesCount,
      totalBufferBottles,
      totalAllocatedBottles,
      totalBatches: items.length,
    }
  },
}

