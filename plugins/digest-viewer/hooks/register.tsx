import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Digest, Priority, Run, RunList, View } from '../types'
import { parseDigest, plain, statsLine } from './parse'

const PANE = 'digest'
const DOWNLOADS = 'downloads'
const REPO = 'ROCm/repo-digest' // as scripts/download-artifacts.sh defaults to
const RUNS_LIMIT = '60'

// Bump a shape tag when that value's fields change: a reload keeps what the
// earlier version stored, and the tag makes new code read it as the initial.
const DEFAULT_VIEW: View = {
  filter: 'all',
  isRocmOnly: false,
  isSummaryOpen: true,
  expanded: [],
}
const digestAtom = atom({ plugin: 'digest-viewer', key: 'digest' } as const, null, {
  shape: 'digest-2',
})
const viewAtom = atom({ plugin: 'digest-viewer', key: 'view' } as const, DEFAULT_VIEW, {
  shape: 'view-1',
})
const libraryAtom = atom({ plugin: 'digest-viewer', key: 'library' } as const, [], {
  shape: 'library-1',
})
const statusAtom = atom({ plugin: 'digest-viewer', key: 'status' } as const, '', {
  shape: 'status-1',
})
const runsAtom = atom({ plugin: 'digest-viewer', key: 'runs' } as const, null, {
  shape: 'runs-1',
})

/** `/digest fetch <name>` → [workflow file, artifact name], per download-artifacts. */
const WORKFLOWS: Record<string, readonly [string, string]> = {
  xla: ['xla-daily-digest.yml', 'digest'],
  triton: ['triton-daily-digest.yml', 'digest'],
  'triton-daily': ['triton-daily-digest.yml', 'digest'],
  'triton-weekly': ['triton-weekly-digest.yml', 'weekly-digest'],
  llvm: ['llvm-weekly-digest.yml', 'llvm-digest-weekly'],
  'llvm-weekly': ['llvm-weekly-digest.yml', 'llvm-digest-weekly'],
  maxtext: ['maxtext-daily-digest.yml', 'maxtext-digest'],
  'maxtext-daily': ['maxtext-daily-digest.yml', 'maxtext-digest'],
  'maxtext-weekly': ['maxtext-weekly-digest.yml', 'maxtext-weekly-digest'],
  jax: ['jax-daily-digest.yml', 'jax-digest'],
  'jax-daily': ['jax-daily-digest.yml', 'jax-digest'],
  'jax-weekly': ['jax-weekly-digest.yml', 'jax-weekly-digest'],
  miles: ['miles-weekly-digest.yml', 'miles-digest'],
  'miles-weekly': ['miles-weekly-digest.yml', 'miles-digest'],
  slime: ['slime-weekly-digest.yml', 'slime-digest'],
  'slime-weekly': ['slime-weekly-digest.yml', 'slime-digest'],
  verl: ['verl-weekly-digest.yml', 'verl-digest'],
  'verl-weekly': ['verl-weekly-digest.yml', 'verl-digest'],
  vime: ['vime-weekly-digest.yml', 'vime-digest'],
  'vime-weekly': ['vime-weekly-digest.yml', 'vime-digest'],
}

const PRIORITY_COLOR = { high: 'error', medium: 'warning', low: 'success' } as const
const FILTERS = [
  { id: 'all', label: 'All', hotkey: 'a' },
  { id: 'high', label: 'High', hotkey: 'h' },
  { id: 'medium', label: 'Medium', hotkey: 'm' },
  { id: 'low', label: 'Low', hotkey: 'l' },
] as const

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const setStatus = ($: EngineInterface, text: string) => update($, statusAtom, () => text)

/** Runs `gh` and returns its stdout, or throws with the tail of its stderr. */
async function gh($: EngineInterface, args: string[], timeoutMs = 60_000): Promise<string> {
  const run = await $.process.run(['gh', ...args], { timeoutMs })
  if (run.exitCode !== 0) {
    const why = (run.stderr || run.stdout).trim().split('\n').slice(-3).join(' ')
    throw new Error(`gh ${args[0]} ${args[1] ?? ''}: ${why}`)
  }
  return run.stdout
}

// ---------------------------------------------------------------------------
// Local files

/** Every downloaded digest markdown file, newest first. */
async function listDigests($: EngineInterface): Promise<string[]> {
  if (!(await $.fs.exists(DOWNLOADS))) return []
  const found: { path: string; mtimeMs: number }[] = []
  for (const dir of await $.fs.list(DOWNLOADS)) {
    if (dir.kind !== 'dir') continue
    for (const file of await $.fs.list(`${DOWNLOADS}/${dir.name}`)) {
      if (file.kind === 'file' && file.name.endsWith('.md')) {
        found.push({ path: `${DOWNLOADS}/${dir.name}/${file.name}`, mtimeMs: file.mtimeMs })
      }
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path))
  return found.map(f => f.path)
}

/** The digest file already downloaded for a run, if any. */
async function localDigestOf($: EngineInterface, runId: string): Promise<string | undefined> {
  const dir = `${DOWNLOADS}/run-${runId}`
  try {
    if (!(await $.fs.exists(dir))) return undefined
    const md = (await $.fs.list(dir)).find(f => f.kind === 'file' && f.name.endsWith('.md'))
    return md ? `${dir}/${md.name}` : undefined
  } catch {
    return undefined
  }
}

async function refreshLibrary($: EngineInterface): Promise<string[]> {
  const files = await listDigests($)
  await update($, libraryAtom, () => files)
  return files
}

// ---------------------------------------------------------------------------
// GitHub runs

/** Reads a workflow's successful runs, newest first, and stores them. */
async function fetchRuns(
  $: EngineInterface,
  workflowId: number,
  workflowName: string,
): Promise<RunList> {
  const out = await gh($, [
    'run', 'list', '-R', REPO, '--workflow', String(workflowId),
    '--status', 'success', '--limit', RUNS_LIMIT, '--json', 'databaseId,createdAt',
  ])
  const runs: Run[] = (JSON.parse(out) as { databaseId: number; createdAt: string }[])
    .map(r => ({ id: String(r.databaseId), createdAt: r.createdAt }))
  const list: RunList = { workflowId, workflowName, runs, checkedAt: Date.now() }
  await update($, runsAtom, () => list)
  return list
}

/** Makes sure the stored run list is the one of the workflow `runId` belongs to. */
async function ensureRuns($: EngineInterface, runId: string): Promise<void> {
  if (!runId) return
  const known = await read($, runsAtom)
  if (known?.runs.some(r => r.id === runId)) return
  const out = await gh($, ['run', 'view', runId, '-R', REPO, '--json', 'workflowDatabaseId,workflowName'])
  const run = JSON.parse(out) as { workflowDatabaseId: number; workflowName: string }
  await fetchRuns($, run.workflowDatabaseId, run.workflowName)
}

/** Downloads a run's digest artifact into downloads/run-<id>/ and returns the .md path. */
async function downloadRun($: EngineInterface, runId: string): Promise<string> {
  const names = (
    await gh($, ['api', `repos/${REPO}/actions/runs/${runId}/artifacts`, '--jq', '.artifacts[] | select(.expired | not) | .name'])
  ).trim().split('\n').filter(Boolean)
  // Manually triggered runs also upload `digest-debug-logs`: never that one.
  const artifact = names.find(n => /digest/i.test(n) && !/debug/i.test(n))
  if (!artifact) throw new Error(`run ${runId} has no artifact left on GitHub (expired?)`)
  await gh($, ['run', 'download', runId, '-R', REPO, '-n', artifact, '-D', `${DOWNLOADS}/run-${runId}`], 180_000)
  const path = await localDigestOf($, runId)
  if (!path) throw new Error(`artifact "${artifact}" of run ${runId} holds no .md file`)
  return path
}

// ---------------------------------------------------------------------------
// Loading and navigating

async function loadDigest($: EngineInterface, path: string): Promise<Digest> {
  const digest = parseDigest(path, await $.fs.read(path))
  await update($, digestAtom, () => digest)
  await update($, viewAtom, v => ({ ...(v ?? DEFAULT_VIEW), expanded: [] }))
  await setStatus($, '')
  try {
    await ensureRuns($, digest.runId)
  } catch (err) {
    await setStatus($, `Could not read runs from GitHub (older/newer use local files): ${errorText(err)}`)
  }
  return digest
}

/** Opens a run: the local file when there is one, else downloads it first. */
async function goToRun($: EngineInterface, run: Run): Promise<void> {
  if ((await read($, statusAtom)).startsWith('Downloading')) return
  try {
    let path = await localDigestOf($, run.id)
    if (!path) {
      await setStatus($, `Downloading run ${run.id} (${run.createdAt.slice(0, 10)})…`)
      path = await downloadRun($, run.id)
      await refreshLibrary($)
    }
    await loadDigest($, path)
  } catch (err) {
    await setStatus($, `Error: ${errorText(err)}`)
  }
}

async function checkForNewer($: EngineInterface): Promise<void> {
  const known = await read($, runsAtom)
  if (!known) return
  try {
    await setStatus($, 'Checking GitHub for newer runs…')
    const before = known.runs[0]?.id
    const list = await fetchRuns($, known.workflowId, known.workflowName)
    const newest = list.runs[0]
    await setStatus(
      $,
      newest && newest.id !== before
        ? `New run on GitHub: ${newest.createdAt.slice(0, 10)}. Press Newer to download it.`
        : 'Up to date: no newer run on GitHub.',
    )
  } catch (err) {
    await setStatus($, `Error: ${errorText(err)}`)
  }
}

function summaryText(d: Digest): string {
  const n = (p: Priority) => d.items.filter(i => i.priority === p).length
  return `${d.title}: ${n('high')} high, ${n('medium')} medium, ${n('low')} low (${d.path})`
}

const shortDate = (iso: string) => iso.slice(5, 10)

// ---------------------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'digest',
      description: 'Browse a repo-digest digest in a pane',
      argumentHint: '[fetch xla|triton|jax|maxtext|llvm|verl|slime|miles|vime|… | close | path/to/digest.md]',
    })
    return next(e)
  })

  on('command.run', { command: 'digest' }, async ($, e) => {
    // Shown to the person only: no note for the model, so no model turn follows.
    const answer = (text: string) => ({ text, isTextDisplayOnly: true as const })
    const [sub = '', arg = ''] = e.args.trim().split(/\s+/)

    if (sub === 'close') {
      await $.ui.close({ id: PANE })
      return answer('Digest pane closed.')
    }

    try {
      let path: string | undefined

      if (sub === 'fetch') {
        const name = (arg || 'xla').toLowerCase()
        const workflow = WORKFLOWS[name]
        if (!workflow) {
          return answer(`Unknown workflow "${name}". Known: ${Object.keys(WORKFLOWS).join(', ')}`)
        }
        await setStatus($, `Fetching the latest ${workflow[0]}…`)
        await $.ui.open({ id: PANE, title: 'Digest' })
        const run = await $.process.run(
          ['bash', 'scripts/download-artifacts.sh', '-a', workflow[1], workflow[0]],
          { timeoutMs: 300_000 },
        )
        const dir = /-> (\S*run-\d+)/.exec(run.stdout)?.[1]
        if (run.exitCode !== 0 || !dir) {
          const why = (run.stderr || run.stdout).trim().split('\n').slice(-5).join('\n')
          await setStatus($, `Fetch failed:\n${why}`)
          return answer(`Fetching ${workflow[0]} failed:\n${why}`)
        }
        const md = (await $.fs.list(dir)).find(f => f.kind === 'file' && f.name.endsWith('.md'))
        if (!md) return answer(`No .md file in ${dir}.`)
        path = `${dir.replace(/^\.\//, '')}/${md.name}`
      } else if (sub.endsWith('.md')) {
        path = sub
      }

      const library = await refreshLibrary($)
      path ??= library[0]
      if (!path) {
        await $.ui.open({ id: PANE, title: 'Digest' })
        return answer(`No digests in ./${DOWNLOADS}. Try /digest fetch xla.`)
      }
      const digest = await loadDigest($, path)
      await $.ui.open({ id: PANE, title: 'Digest' })
      return answer(summaryText(digest))
    } catch (err) {
      await setStatus($, `Error: ${errorText(err)}`)
      return answer(`digest-viewer: ${errorText(err)}`)
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const digest = await read($, digestAtom)
    const view = (await read($, viewAtom)) ?? DEFAULT_VIEW
    const library = await read($, libraryAtom)
    const status = await read($, statusAtom)
    const runs = await read($, runsAtom)

    const setView = (fn: (v: View) => View) =>
      update($, viewAtom, v => fn(v ?? DEFAULT_VIEW))
    const closeButton = (
      <Button key="close" hotkey="q" onPress={() => $.ui.close({ id: PANE })}>
        Close
      </Button>
    )

    if (!digest) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{status || 'No digest loaded. Run /digest or /digest fetch xla.'}</Text>
          <Box marginTop={1}>{closeButton}</Box>
        </Box>
      )
    }

    const pool = view.isRocmOnly ? digest.items.filter(i => i.isRocm) : digest.items
    const count = (f: View['filter']) =>
      f === 'all' ? pool.length : pool.filter(i => i.priority === f).length
    const visible = view.filter === 'all' ? pool : pool.filter(i => i.priority === view.filter)

    // Older/newer: along the workflow's GitHub runs when known, each marked
    // local (opens at once) or to download; else along the local files.
    const isBusy = status.startsWith('Downloading') || status.startsWith('Checking')
    const at = runs ? runs.runs.findIndex(r => r.id === digest.runId) : -1
    let navigation: JSX.Element[]
    if (runs && at >= 0) {
      const older = runs.runs[at + 1]
      const newer = at > 0 ? runs.runs[at - 1] : undefined
      const olderPath = older ? await localDigestOf($, older.id) : undefined
      const newerPath = newer ? await localDigestOf($, newer.id) : undefined
      navigation = [
        ...(older
          ? [
              <Button key="older" hotkey="p" onPress={() => goToRun($, older)}>
                {olderPath ? `← Older · ${shortDate(older.createdAt)}` : `⇣ Older · ${shortDate(older.createdAt)} (download)`}
              </Button>,
            ]
          : []),
        newer ? (
          <Button
            key="newer"
            hotkey="n"
            variant={newerPath ? undefined : 'primary'}
            onPress={() => goToRun($, newer)}
          >
            {newerPath ? `Newer · ${shortDate(newer.createdAt)} →` : `⇣ Newer · ${shortDate(newer.createdAt)} (download)`}
          </Button>
        ) : (
          <Button key="check" hotkey="c" onPress={() => checkForNewer($)}>
            ⟳ Check for newer
          </Button>
        ),
      ]
    } else {
      const i = library.indexOf(digest.path)
      const older = i >= 0 ? library[i + 1] : undefined
      const newer = i > 0 ? library[i - 1] : undefined
      navigation = [
        ...(older
          ? [<Button key="older" hotkey="p" onPress={() => loadDigest($, older)}>← Older (local)</Button>]
          : []),
        ...(newer
          ? [<Button key="newer" hotkey="n" onPress={() => loadDigest($, newer)}>Newer (local) →</Button>]
          : []),
      ]
    }

    return (
      <Box flexDirection="column">
        <Text bold>{digest.title}</Text>
        <Text dimColor wrap="truncate-end">
          {statsLine(digest.stats)}
          {runs && at >= 0 ? ` · run ${at + 1} of ${runs.runs.length} on GitHub` : ''}
        </Text>
        {status !== '' && <Text color={status.startsWith('Error') ? 'error' : 'warning'}>{status}</Text>}

        <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
          {isBusy ? [] : navigation}
          {closeButton}
        </Box>

        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {FILTERS.map(f => (
            <Button
              key={`filter-${f.id}`}
              hotkey={f.hotkey}
              variant={view.filter === f.id ? 'primary' : undefined}
              onPress={() => setView(v => ({ ...v, filter: f.id, expanded: [] }))}
            >
              {f.label} {String(count(f.id))}
            </Button>
          ))}
          <Button
            key="rocm-only"
            hotkey="r"
            variant={view.isRocmOnly ? 'primary' : undefined}
            onPress={() => setView(v => ({ ...v, isRocmOnly: !v.isRocmOnly, expanded: [] }))}
          >
            {view.isRocmOnly ? '■' : '□'} ROCm only
          </Button>
          <Button
            key="summary"
            hotkey="s"
            onPress={() => setView(v => ({ ...v, isSummaryOpen: !v.isSummaryOpen }))}
          >
            {view.isSummaryOpen ? 'Hide summary' : 'Show summary'}
          </Button>
          <Button
            key="toggle-all"
            hotkey="x"
            onPress={() =>
              setView(v => ({
                ...v,
                expanded: v.expanded.length > 0 ? [] : visible.map(i => i.id),
              }))
            }
          >
            {view.expanded.length > 0 ? 'Collapse all' : 'Expand all'}
          </Button>
        </Box>

        {view.isSummaryOpen && digest.summary !== '' && (
          <Box marginTop={1}>
            <Markdown text={digest.summary} />
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {visible.length === 0 && <Text dimColor>No entries match.</Text>}
          {visible.map(item => {
            const isOpen = view.expanded.includes(item.id)
            return (
              <Box flexDirection="column">
                <Button
                  key={item.id}
                  plain
                  onPress={() =>
                    setView(v => ({
                      ...v,
                      expanded: v.expanded.includes(item.id)
                        ? v.expanded.filter(id => id !== item.id)
                        : [...v.expanded, item.id],
                    }))
                  }
                >
                  {isOpen ? '▾ ' : '▸ '}
                  <Text color={PRIORITY_COLOR[item.priority]}>●</Text> {plain(item.title)}
                  {item.isRocm ? <Text color="suggestion"> ROCm</Text> : ''}
                  <Text dimColor> {item.sha}</Text>
                </Button>
                {isOpen && (
                  <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
                    {item.author !== '' && <Text dimColor>by {item.author}</Text>}
                    <Markdown
                      text={item.url ? `${item.body}\n\n[${item.sha}](${item.url})` : item.body}
                    />
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
