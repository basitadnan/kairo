import { useEffect } from 'react'
import { format } from 'date-fns'
import { useSync, refreshSyncStatus } from '../lib/sync'
import { cn } from '../lib/cn'

function describe(status: string, lastSyncedAt?: number): { dot: string; label: string } {
  switch (status) {
    case 'syncing':
      return { dot: 'bg-accent animate-pulse', label: 'Syncing' }
    case 'ok':
      return {
        dot: 'bg-accent',
        label: lastSyncedAt ? `Synced ${format(lastSyncedAt, 'HH:mm')}` : 'Synced',
      }
    case 'error':
      return { dot: 'bg-chip-red-text', label: 'Sync error' }
    case 'signed-out':
      return { dot: 'bg-ink-3', label: 'Not paired' }
    case 'no-config':
      return { dot: 'bg-ink-3', label: 'Not connected' }
    default:
      return { dot: 'bg-ink-3', label: '' }
  }
}

export function SyncStatus({ className }: { className?: string }) {
  const { status, lastSyncedAt } = useSync()
  useEffect(() => {
    void refreshSyncStatus()
  }, [])
  const { dot, label } = describe(status, lastSyncedAt)
  if (!label) return null
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
      <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">{label}</span>
    </div>
  )
}
