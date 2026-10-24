export interface Workspace {
  name: string
  repositories: string[]
}

export interface RecentWorkspace {
  path: string
  name: string
  lastOpenedAt: string
}

export interface AppSettings {
  defaultWorkspace: string | null
  theme: 'light' | 'dark'
  uiFontSize: number
  codeFontSize: number
  language: 'de' | 'en'
  changesView: 'files' | 'modules'
}

export const defaultSettings: AppSettings = {
  defaultWorkspace: null,
  theme: 'dark',
  uiFontSize: 12,
  codeFontSize: 12,
  language: 'en',
  changesView: 'modules'
}

export interface RepositorySummary {
  path: string
  name: string
  branch: string
  ahead: number
  behind: number
  upstream: string | null
  changed: number
  staged: number
  isClean: boolean
}

export interface ChangedFile {
  path: string
  index: string
  workingDir: string
  staged: boolean
  status: string
}

export interface CommitSummary {
  hash: string
  date: string
  message: string
  author: string
}

export interface UnpushedCommits {
  upstream: string | null
  comparison: 'upstream' | 'remotes' | 'detached'
  commits: CommitSummary[]
}

export interface CommitFile {
  path: string
  previousPath?: string
  status: string
}

export interface RepositoryDetails {
  summary: RepositorySummary
  files: ChangedFile[]
}

export interface PullRequestResult {
  html_url: string
}

export interface DeviceFlowInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface DeviceFlowPollResult {
  status: 'pending' | 'complete'
  interval?: number
}
