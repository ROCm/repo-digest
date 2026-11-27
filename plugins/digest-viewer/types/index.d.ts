export type Priority = 'high' | 'medium' | 'low'

export type DigestItem = {
  id: string
  title: string
  author: string
  sha: string
  url: string
  body: string
  priority: Priority
  isRocm: boolean
}

export type Digest = {
  path: string
  /** GitHub Actions run id, from the `run-<id>` folder; '' when unknown. */
  runId: string
  title: string
  summary: string
  stats: string[]
  items: DigestItem[]
}

/** One successful run of a digest workflow on GitHub. */
export type Run = { id: string; createdAt: string }

/** A workflow's successful runs, newest first, as last read from GitHub. */
export type RunList = { workflowId: number; workflowName: string; runs: Run[]; checkedAt: number }

export type View = {
  filter: 'all' | Priority
  isRocmOnly: boolean
  isSummaryOpen: boolean
  expanded: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'digest-viewer': {
      digest: Shaped<Digest | null>
      view: Shaped<View>
      library: Shaped<string[]>
      status: Shaped<string>
      runs: Shaped<RunList | null>
    }
  }
}
