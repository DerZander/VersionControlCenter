import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CommitSummary,
  CommitFile,
  DeviceFlowInfo,
  DeviceFlowPollResult,
  RecentWorkspace,
  RepositoryDetails,
  RepositorySummary,
  UnpushedCommits,
  Workspace
} from '../shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:save', settings),
  chooseDefaultWorkspace: (): Promise<string | null> => ipcRenderer.invoke('settings:choose-workspace'),
  openDefaultWorkspace: (): Promise<{ path: string; workspace: Workspace } | null> =>
    ipcRenderer.invoke('workspace:open-default'),
  openWorkspace: (): Promise<{ path: string; workspace: Workspace } | null> =>
    ipcRenderer.invoke('workspace:open'),
  getRecentWorkspaces: (): Promise<RecentWorkspace[]> =>
    ipcRenderer.invoke('workspace:recent-list'),
  openRecentWorkspace: (path: string): Promise<{ path: string; workspace: Workspace }> =>
    ipcRenderer.invoke('workspace:recent-open', path),
  createWorkspace: (): Promise<{ path: string; workspace: Workspace } | null> =>
    ipcRenderer.invoke('workspace:create'),
  addRepositories: (): Promise<string[] | null> => ipcRenderer.invoke('repositories:add'),
  scanFolder: (): Promise<string[] | null> => ipcRenderer.invoke('repositories:scan'),
  saveWorkspace: (repositories: string[]): Promise<Workspace> =>
    ipcRenderer.invoke('workspace:save', repositories),
  updateWorkspace: (workspace: Workspace): Promise<Workspace> =>
    ipcRenderer.invoke('workspace:update', workspace),
  getRepositories: (paths: string[]): Promise<RepositorySummary[]> =>
    ipcRenderer.invoke('git:list', paths),
  getRepositoryDetails: (path: string): Promise<RepositoryDetails> =>
    ipcRenderer.invoke('git:details', path),
  getRepositoryLog: (path: string): Promise<CommitSummary[]> =>
    ipcRenderer.invoke('git:log', path),
  getUnpushedCommits: (path: string): Promise<UnpushedCommits> =>
    ipcRenderer.invoke('git:unpushed', path),
  getCommitFiles: (path: string, hash: string): Promise<CommitFile[]> =>
    ipcRenderer.invoke('git:commit-files', path, hash),
  getCommitFileDiff: (path: string, hash: string, file: string): Promise<string> =>
    ipcRenderer.invoke('git:commit-file-diff', path, hash, file),
  getFileDiff: (path: string, file: string): Promise<string> =>
    ipcRenderer.invoke('git:diff', path, file),
  stageFiles: (path: string, files: string[]): Promise<void> =>
    ipcRenderer.invoke('git:stage', path, files),
  stageHunks: (path: string, file: string, indexes: number[]): Promise<void> =>
    ipcRenderer.invoke('git:stage-hunks', path, file, indexes),
  unstageFiles: (path: string, files: string[]): Promise<void> =>
    ipcRenderer.invoke('git:unstage', path, files),
  discardFile: (path: string, file: string): Promise<boolean> =>
    ipcRenderer.invoke('git:discard-file', path, file),
  commit: (path: string, message: string): Promise<void> =>
    ipcRenderer.invoke('git:commit', path, message),
  sync: (path: string, action: 'fetch' | 'pull' | 'push'): Promise<string> =>
    ipcRenderer.invoke('git:sync', path, action),
  syncAll: (paths: string[], action: 'fetch' | 'pull' | 'push'): Promise<string[]> =>
    ipcRenderer.invoke('git:sync-all', paths, action),
  createBranch: (path: string, branchName: string, fromBranch: string): Promise<string> =>
    ipcRenderer.invoke('git:create-branch', path, branchName, fromBranch),
  createPullRequest: (path: string, title: string, body: string): Promise<string> =>
    ipcRenderer.invoke('github:create-pr', path, title, body),
  saveGitHubToken: (token: string): Promise<void> =>
    ipcRenderer.invoke('github:save-token', token),
  getGitHubClientId: (): Promise<string> => ipcRenderer.invoke('github:get-client-id'),
  startGitHubDeviceFlow: (clientId: string): Promise<DeviceFlowInfo> =>
    ipcRenderer.invoke('github:start-device-flow', clientId),
  pollGitHubDeviceFlow: (): Promise<DeviceFlowPollResult> =>
    ipcRenderer.invoke('github:poll-device-flow'),
  cancelGitHubDeviceFlow: (): Promise<void> => ipcRenderer.invoke('github:cancel-device-flow'),
  hasGitHubToken: (): Promise<boolean> => ipcRenderer.invoke('github:has-token'),
  openRepositoryInExplorer: (path: string): Promise<void> =>
    ipcRenderer.invoke('repository:open-explorer', path),
  openRepositoryBash: (path: string): Promise<void> =>
    ipcRenderer.invoke('repository:open-bash', path),
  openRepositoryRemote: (path: string): Promise<void> =>
    ipcRenderer.invoke('repository:open-remote', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url)
}

export type VccApi = typeof api

contextBridge.exposeInMainWorld('vcc', api)
