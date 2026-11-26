import type { Digest, DigestItem, Priority } from '../types'

const ITEM = /^(.*?) by \*([^*]+)\*\s*\[([0-9a-f]{6,40})\]\((\S+)\)\s*$/

/** Plain text for a one-line row: drops bold markers and backticks. */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/`/g, '')
}

/** True when the entry matters for ROCm: its ROCm impact is not "none". */
export function isRocmRelevant(title: string, body: string): boolean {
  const impact = /\*\*ROCm impact:\*\*\s*(.*)/i.exec(body)
  if (impact) return !/^(none|no action)/i.test((impact[1] ?? '').trim())
  return /\b(rocm|amd|amdgpu|rccl|hip|gfx\d+)\b/i.test(`${title} ${body}`)
}

function priorityOf(heading: string): Priority | null {
  const h = heading.toLowerCase()
  if (h.includes('high')) return 'high'
  if (h.includes('medium')) return 'medium'
  if (h.includes('low')) return 'low'
  return null
}

/** Parses a repo-digest markdown file into its summary, entries and stats. */
export function parseDigest(path: string, text: string): Digest {
  let title = path
  let section = ''
  let priority: Priority | null = null
  const summary: string[] = []
  const stats: string[] = []
  const items: DigestItem[] = []
  let current: Omit<DigestItem, 'body' | 'isRocm'> | null = null
  let body: string[] = []

  const flush = () => {
    if (current) {
      const text = body.join('\n').trim()
      items.push({ ...current, body: text, isRocm: isRocmRelevant(current.title, text) })
    }
    current = null
    body = []
  }

  for (const line of text.split('\n')) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim()
    } else if (line.startsWith('## ')) {
      flush()
      section = line.slice(3).trim().toLowerCase()
      priority = null
    } else if (line.startsWith('### ')) {
      flush()
      priority = priorityOf(line)
    } else if (section === 'summary') {
      summary.push(line)
    } else if (section.startsWith('stats')) {
      if (line.startsWith('- ')) stats.push(line.slice(2).trim())
    } else if (priority && line.startsWith('- ')) {
      flush()
      const raw = line.slice(2).trim()
      const [, title = raw, author = '', sha = '', url = ''] = ITEM.exec(raw) ?? []
      current = { id: sha ? `${items.length}-${sha}` : `${items.length}`, title, author, sha, url, priority }
    } else if (current) {
      body.push(line.replace(/^ {4}/, ''))
    }
  }
  flush()

  const runId = /run-(\d+)/.exec(path)?.[1] ?? ''
  return { path, runId, title, summary: summary.join('\n').trim(), stats, items }
}

/** "66 commits · 32 contributors" style one-liner from the Stats bullets. */
export function statsLine(stats: readonly string[]): string {
  return stats
    .map(s => plain(s).replace(/\s*\(.*\)\s*$/, ''))
    .join(' · ')
}
