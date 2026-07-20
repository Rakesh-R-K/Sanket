import Dexie, { type Table } from 'dexie'
import { api, type TxnInput } from './api'

export interface LocalTxn extends Omit<TxnInput, 'client_id'> {
  id?: number
  clientId: string
  synced: 0 | 1
  error?: string
}

class SanketDB extends Dexie {
  outbox!: Table<LocalTxn, number>
  constructor() {
    super('sanket')
    this.version(1).stores({ outbox: '++id, synced, enterprise_id' })
    this.version(2).stores({ outbox: '++id, synced, enterprise_id, &clientId' })
      .upgrade(tx => tx.table('outbox').toCollection().modify(row => {
        row.clientId ??= crypto.randomUUID()
      }))
  }
}

export const localdb = new SanketDB()

export async function recordTxn(txn: Omit<LocalTxn, 'id' | 'clientId' | 'synced' | 'source' | 'error'>) {
  const id = await localdb.outbox.add({ ...txn, clientId: crypto.randomUUID(), source: 'manual', synced: 0 })
  void drainOutbox().catch(() => {})
  return id
}

export function pendingCount() {
  return localdb.outbox.where('synced').equals(0).count()
}

async function syncPending(): Promise<number> {
  let count = 0
  while (navigator.onLine) {
    const rows = await localdb.outbox.where('synced').equals(0).limit(100).toArray()
    if (!rows.length) break
    try {
      const res = await api.syncTxns(rows.map(row => ({
        client_id: row.clientId, enterprise_id: row.enterprise_id, type: row.type,
        amount: row.amount, note: row.note, entered_at: row.entered_at, source: 'manual',
      })))
      if (!Array.isArray(res.accepted_ids) || rows.some(row => !res.accepted_ids.includes(row.clientId))) {
        throw new Error('The server did not confirm every entry. They are still saved here.')
      }
      await localdb.outbox.bulkUpdate(rows.map(row => ({ key: row.id!, changes: { synced: 1 as const, error: '' } })))
      count += rows.length
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Sync failed. Your entries are still saved here.'
      await localdb.outbox.bulkUpdate(rows.map(row => ({ key: row.id!, changes: { error } })))
      break
    }
  }
  if (count) window.dispatchEvent(new Event('sanket-sync'))
  return count
}

let drainJob: Promise<number> | null = null
export function drainOutbox(): Promise<number> {
  drainJob ??= syncPending().finally(() => { drainJob = null })
  return drainJob
}
