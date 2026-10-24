import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Github,
  History,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Terminal,
  Undo2,
  X
} from 'lucide-react'
import type {
  AppSettings,
  ChangedFile,
  CommitSummary,
  CommitFile,
  DeviceFlowInfo,
  RecentWorkspace,
  RepositoryDetails,
  RepositorySummary,
  UnpushedCommits,
  Workspace
} from '../../shared/types'
import { defaultSettings } from '../../shared/types'
import { SettingsDialog } from './SettingsDialog'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { ChangesViewOptions } from './ChangesViewOptions'
import { ResizableChangesLayout } from './ResizableChangesLayout'
import { WorkspaceEditor } from './WorkspaceEditor'
import { DiffHorizontalScroll } from './DiffHorizontalScroll'
import { useTranslation } from './LanguageContext'
import { translate } from '../../shared/i18n'
import { buildFileTree, type FileTreeDirectory } from './fileTree'

type Tab = 'changes' | 'unpushed' | 'log'
type Dialog = 'branch' | 'pull-request' | null

function App(): JSX.Element {
  const { t, language, setLanguage } = useTranslation()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([])
  const [openingRecent, setOpeningRecent] = useState(false)
  const [repositories, setRepositories] = useState<RepositorySummary[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [details, setDetails] = useState<RepositoryDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [commits, setCommits] = useState<CommitSummary[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [unpushed, setUnpushed] = useState<UnpushedCommits | null>(null)
  const [unpushedLoading, setUnpushedLoading] = useState(false)
  const [unpushedError, setUnpushedError] = useState('')
  const [statusRevision, setStatusRevision] = useState(0)
  const workspaceRefreshId = useRef(0)
  const diffRequestId = useRef(0)
  const activeFile = useRef('')
  const activeRepository = useRef('')
  const [tab, setTab] = useState<Tab>('changes')
  const [groupByDirectory, setGroupByDirectory] = useState(defaultSettings.changesView === 'modules')
  const [filter, setFilter] = useState('')
  const [diffs, setDiffs] = useState<Record<string, string>>({})
  const [activeDiffPath, setActiveDiffPath] = useState('')
  const [selectedHunks, setSelectedHunks] = useState<Record<string, number[]>>({})
  const [commitMessage, setCommitMessage] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [branchName, setBranchName] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [githubClientId, setGithubClientId] = useState('')
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowInfo | null>(null)
  const deviceFlowCancelled = useRef(false)
  const [hasToken, setHasToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceEditorOpen, setWorkspaceEditorOpen] = useState(false)
  const [starting, setStarting] = useState(true)
  const startup = useRef<Promise<{
    settings: AppSettings
    workspace: { path: string; workspace: Workspace } | null
    error?: string
  }> | null>(null)

  const selectedRepository = repositories.find((repo) => repo.path === selectedPath)
  const visibleRepositories = useMemo(
    () => repositories.filter((repo) => repo.name.toLowerCase().includes(filter.toLowerCase())),
    [filter, repositories]
  )
  const fileTree = useMemo(() => buildFileTree(details?.files ?? []), [details?.files])

  const refresh = useCallback(async (paths?: string[]) => {
    const targetPaths = paths ?? workspace?.repositories ?? []
    const requestId = ++workspaceRefreshId.current
    const activePath = targetPaths.includes(selectedPath) ? selectedPath : targetPaths[0] ?? ''
    activeRepository.current = activePath
    setSelectedPath(activePath)
    setStatusRevision((revision) => revision + 1)
    setRepositories((current) => current.filter((repo) => targetPaths.includes(repo.path)))
    if (!targetPaths.length) {
      setRepositories([])
      setDetails(null)
      setSelectedPath('')
      setDiffs({})
      setActiveDiffPath('')
      return
    }
    if (activePath !== selectedPath) {
      setDetails(null)
      setDiffs({})
      setActiveDiffPath('')
      activeFile.current = ''
    }
    const otherPaths = targetPaths.filter((path) => path !== activePath)
    const nextRepositories = otherPaths.length ? await window.vcc.getRepositories(otherPaths) : []
    if (requestId !== workspaceRefreshId.current) return
    setRepositories((current) => {
      const byPath = new Map(current.map((repo) => [repo.path, repo]))
      nextRepositories.forEach((repo) => byPath.set(repo.path, repo))
      return targetPaths.flatMap((path) => {
        const repo = byPath.get(path)
        return repo ? [repo] : []
      })
    })
  }, [selectedPath, workspace?.repositories])

  useEffect(() => {
    void window.vcc.hasGitHubToken().then(setHasToken).catch((reason: Error) => setError(reason.message))
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    void window.vcc.getGitHubClientId().then(setGithubClientId).catch((reason: Error) => setError(reason.message))
  }, [settingsOpen])

  useEffect(() => {
    void window.vcc.getRecentWorkspaces()
      .then(setRecentWorkspaces)
      .catch((reason: Error) => setError(reason.message))
  }, [])

  useEffect(() => {
    setLanguage(settings.language)
    document.documentElement.lang = settings.language
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`)
    document.documentElement.style.setProperty('--code-font-size', `${settings.codeFontSize}px`)
    document.documentElement.style.colorScheme = settings.theme
  }, [settings, setLanguage])

  useEffect(() => {
    let cancelled = false
    if (!startup.current) {
      startup.current = window.vcc.getSettings().then(async (loadedSettings) => {
        try {
          return { settings: loadedSettings, workspace: await window.vcc.openDefaultWorkspace() }
        } catch (reason) {
          return {
            settings: loadedSettings,
            workspace: null,
            error: translate(loadedSettings.language, "Standard-Workspace konnte nicht geöffnet werden: {0}", reason instanceof Error ? reason.message : String(reason))
          }
        }
      })
    }
    void startup.current.then(async (result) => {
      if (cancelled) return
      setSettings(result.settings)
      setGroupByDirectory(result.settings.changesView === 'modules')
      if (result.error) setError(result.error)
      if (result.workspace) {
        setWorkspace(result.workspace.workspace)
        setWorkspacePath(result.workspace.path)
        await refresh(result.workspace.workspace.repositories)
        setRecentWorkspaces(await window.vcc.getRecentWorkspaces())
      }
    }).catch((reason: Error) => { if (!cancelled) setError(reason.message) })
      .finally(() => { if (!cancelled) setStarting(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!selectedPath) {
      setDetails(null)
      setDetailsLoading(false)
      return
    }
    setDetailsLoading(true)
    setDiffs({})
    setSelectedHunks({})
    diffRequestId.current += 1
    void window.vcc.getRepositoryDetails(selectedPath)
      .then(async (nextDetails) => {
        if (cancelled) return
        setDetails(nextDetails)
        setDetailsLoading(false)
        setRepositories((current) => {
          const existing = current.find((repo) => repo.path === nextDetails.summary.path)
          return existing
            ? current.map((repo) => repo.path === nextDetails.summary.path ? nextDetails.summary : repo)
            : [nextDetails.summary, ...current]
        })
        const file = activeFile.current
        if (file && nextDetails.files.some((entry) => entry.path === file)) {
          const diffId = ++diffRequestId.current
          try {
            const patch = await window.vcc.getFileDiff(selectedPath, file)
            if (!cancelled && diffId === diffRequestId.current) setDiffs({ [file]: patch })
          } catch (reason) {
            if (!cancelled && diffId === diffRequestId.current) {
              setError(reason instanceof Error ? reason.message : String(reason))
            }
          }
        } else {
          setActiveDiffPath('')
          activeFile.current = ''
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setDetails(null)
          setError(reason.message)
        }
      })
      .finally(() => { if (!cancelled) setDetailsLoading(false) })
    return () => { cancelled = true }
  }, [selectedPath, statusRevision, workspacePath])

  useEffect(() => {
    let cancelled = false
    setCommits([])
    if (tab !== 'log' || !selectedPath) {
      setLogLoading(false)
      return
    }
    setLogLoading(true)
    void window.vcc.getRepositoryLog(selectedPath)
      .then((nextCommits) => { if (!cancelled) setCommits(nextCommits) })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message) })
      .finally(() => { if (!cancelled) setLogLoading(false) })
    return () => { cancelled = true }
  }, [tab, selectedPath, statusRevision, workspacePath])

  useEffect(() => {
    let cancelled = false
    setUnpushed(null)
    setUnpushedError('')
    if (!selectedPath) {
      setUnpushedLoading(false)
      return
    }
    setUnpushedLoading(true)
    void window.vcc.getUnpushedCommits(selectedPath)
      .then((result) => { if (!cancelled) setUnpushed(result) })
      .catch((reason: Error) => { if (!cancelled) setUnpushedError(reason.message) })
      .finally(() => { if (!cancelled) setUnpushedLoading(false) })
    return () => { cancelled = true }
  }, [selectedPath, statusRevision, workspacePath])

  const perform = async (action: () => Promise<void>, success?: string, refreshWorkspace = false): Promise<void> => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      if (success) setNotice(success)
      if (workspace) {
        if (refreshWorkspace) await refresh()
        else setStatusRevision((revision) => revision + 1)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const openWorkspace = async (): Promise<void> => {
    setOpeningRecent(true)
    setError('')
    try {
      const result = await window.vcc.openWorkspace()
      if (!result) return
      setWorkspace(result.workspace)
      setWorkspacePath(result.path)
      await refresh(result.workspace.repositories)
      setRecentWorkspaces(await window.vcc.getRecentWorkspaces())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpeningRecent(false)
    }
  }

  const openRecentWorkspace = async (path: string): Promise<void> => {
    setOpeningRecent(true)
    setError('')
    try {
      const result = await window.vcc.openRecentWorkspace(path)
      setWorkspace(result.workspace)
      setWorkspacePath(result.path)
      await refresh(result.workspace.repositories)
      setRecentWorkspaces(await window.vcc.getRecentWorkspaces())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      try {
        setRecentWorkspaces(await window.vcc.getRecentWorkspaces())
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      }
    } finally {
      setOpeningRecent(false)
    }
  }

  const createWorkspace = async (): Promise<void> => {
    setOpeningRecent(true)
    setError('')
    try {
      const result = await window.vcc.createWorkspace()
      if (!result) return
      setWorkspace(result.workspace)
      setWorkspacePath(result.path)
      await refresh([])
      setRecentWorkspaces(await window.vcc.getRecentWorkspaces())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpeningRecent(false)
    }
  }

  const addPaths = async (paths: string[] | null): Promise<void> => {
    if (!paths?.length || !workspace) return
    const merged = [...new Set([...workspace.repositories, ...paths])]
    const saved = await window.vcc.saveWorkspace(merged)
    setWorkspace(saved)
    await refresh(saved.repositories)
  }

  const addRepositories = async (): Promise<void> => {
    try {
      await addPaths(await window.vcc.addRepositories())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const scanRepositories = async (): Promise<void> => {
    try {
      const paths = await window.vcc.scanFolder()
      if (!paths?.length) {
        if (paths) setNotice(t("Im ausgewählten Ordner wurden keine Repositories gefunden."))
        return
      }
      await addPaths(paths)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const loadDiff = async (file: ChangedFile): Promise<void> => {
    setActiveDiffPath(file.path)
    activeFile.current = file.path
    const requestId = ++diffRequestId.current
    if (!selectedPath || diffs[file.path] !== undefined) return
    try {
      const patch = await window.vcc.getFileDiff(selectedPath, file.path)
      if (requestId !== diffRequestId.current || selectedPath !== activeRepository.current) return
      setDiffs((current) => ({ ...current, [file.path]: patch }))
    } catch (reason) {
      if (requestId === diffRequestId.current) setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const stageFile = (file: ChangedFile): void => {
    if (!selectedPath) return
    void perform(
      async () => {
        if (file.staged) await window.vcc.unstageFiles(selectedPath, [file.path])
        else await window.vcc.stageFiles(selectedPath, [file.path])
      }
    )
  }

  const discardFile = (file: ChangedFile): void => {
    if (!selectedPath || busy) return
    void perform(async () => {
      if (await window.vcc.discardFile(selectedPath, file.path)) {
        setNotice(t('Änderungen an „{0}“ verworfen.', file.path))
      }
    })
  }

  const stageChosenHunks = (filePath: string): void => {
    if (!selectedPath) return
    const indexes = selectedHunks[filePath] ?? []
    void perform(async () => {
      await window.vcc.stageHunks(selectedPath, filePath, indexes)
      setSelectedHunks((current) => ({ ...current, [filePath]: [] }))
    }, t("{0} Änderungsblock/-blöcke vorgemerkt.", indexes.length))
  }

  const commit = (): void => {
    if (!selectedPath) return
    void perform(async () => {
      await window.vcc.commit(selectedPath, commitMessage)
      setCommitMessage('')
    }, t("Commit erstellt."))
  }

  const sync = (action: 'fetch' | 'pull' | 'push', all = false): void => {
    const paths = all ? workspace?.repositories ?? [] : selectedPath ? [selectedPath] : []
    if (!paths.length) return
    void perform(async () => {
      if (all) {
        await window.vcc.syncAll(paths, action)
      } else {
        const message = await window.vcc.sync(paths[0], action)
        setNotice(message)
      }
    }, t("{0}{1} für {2} abgeschlossen.", action[0].toUpperCase(), action.slice(1), all ? t('den Workspace') : t('das Repository')), all)
  }

  const showBranchDialog = async (): Promise<void> => {
    if (!selectedPath) return
    try {
      const repo = await window.vcc.getRepositoryDetails(selectedPath)
      setBaseBranch(repo.summary.branch)
      setBranchName('')
      setDialog('branch')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const createBranch = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!selectedPath) return
    await perform(async () => {
      const message = await window.vcc.createBranch(selectedPath, branchName, baseBranch)
      setNotice(message)
      setDialog(null)
    })
  }

  const createPullRequest = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!selectedPath) return
    await perform(async () => {
      const url = await window.vcc.createPullRequest(selectedPath, prTitle, prBody)
      setDialog(null)
      setNotice(t("Pull Request wurde erstellt."))
      await window.vcc.openExternal(url)
    })
  }

  const connectGitHub = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    if (!githubToken.trim()) {
      if (githubClientId.trim()) await startBrowserLogin()
      return
    }
    await perform(async () => {
      await window.vcc.saveGitHubToken(githubToken)
      setGithubToken('')
      setHasToken(true)
    }, t("GitHub-Token sicher gespeichert."))
  }

  const startBrowserLogin = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setNotice('')
    deviceFlowCancelled.current = false
    try {
      const flow = await window.vcc.startGitHubDeviceFlow(githubClientId)
      if (deviceFlowCancelled.current) {
        await window.vcc.cancelGitHubDeviceFlow()
        return
      }
      setDeviceFlow(flow)
      setNotice(t("GitHub-Code {0}: Bestätige die Anmeldung im geöffneten Browser.", flow.userCode))
      let interval = flow.interval
      const expiresAt = Date.now() + flow.expiresIn * 1000
      while (Date.now() < expiresAt) {
        await new Promise((resolve) => window.setTimeout(resolve, interval * 1000))
        if (deviceFlowCancelled.current) {
          setDeviceFlow(null)
          setNotice(t("GitHub-Anmeldung abgebrochen."))
          return
        }
        const result = await window.vcc.pollGitHubDeviceFlow()
        if (deviceFlowCancelled.current) return
        if (result.status === 'complete') {
          setHasToken(true)
          setDeviceFlow(null)
          setNotice(t("GitHub-Konto wurde verbunden."))
          return
        }
        interval = result.interval ?? interval
      }
      throw new Error(t("Der GitHub-Bestätigungscode ist abgelaufen. Bitte starte die Anmeldung erneut."))
    } catch (reason) {
      setDeviceFlow(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const closeDialog = (): void => {
    deviceFlowCancelled.current = true
    if (deviceFlow) {
      void window.vcc.cancelGitHubDeviceFlow().catch((reason: Error) => setError(reason.message))
    }
    setDeviceFlow(null)
    setDialog(null)
  }

  const selectRepository = (repo: RepositorySummary): void => {
    if (selectedPath === repo.path) return
    activeRepository.current = repo.path
    activeFile.current = ''
    diffRequestId.current += 1
    setSelectedPath(repo.path)
    setDetails(null)
    setDiffs({})
    setActiveDiffPath('')
    setSelectedHunks({})
  }

  const openRepositoryLocation = async (kind: 'explorer' | 'bash' | 'remote'): Promise<void> => {
    if (!selectedPath) return
    setError('')
    setNotice('')
    try {
      if (kind === 'explorer') await window.vcc.openRepositoryInExplorer(selectedPath)
      else if (kind === 'bash') await window.vcc.openRepositoryBash(selectedPath)
      else await window.vcc.openRepositoryRemote(selectedPath)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const settingsDialog = settingsOpen ? (
    <SettingsDialog
      settings={settings}
      connecting={busy}
      currentWorkspace={workspacePath}
      recentWorkspaces={recentWorkspaces}
      onClose={() => { closeDialog(); setSettingsOpen(false); setGithubToken('') }}
      onSave={(nextSettings) => {
        setSettings(nextSettings)
        if (nextSettings.changesView !== settings.changesView) setGroupByDirectory(nextSettings.changesView === 'modules')
        closeDialog()
        setGithubToken('')
        setError('')
        setNotice('')
        if (nextSettings.language !== settings.language) setStatusRevision((revision) => revision + 1)
        setSettingsOpen(false)
      }}
      github={(
        <form className="github-settings" onSubmit={(event) => void connectGitHub(event)}>
          <h3>{hasToken ? t('GitHub-Verbindung verwalten') : t("GitHub verbinden")}</h3>
          <p className="modal-hint">{t("Browser-Anmeldung oder Personal Access Token.")}</p>
          {error && <div className="inline-warning" role="alert">{error}</div>}
          {notice && !error && <div className="inline-success" role="status">{notice}</div>}
          {hasToken && <div className="inline-success"><Check size={14} />  {t("Ein Token ist bereits hinterlegt. Ein neuer Token ersetzt ihn.")}</div>}
          <label>{t("GitHub OAuth Client ID")}<input value={githubClientId} onChange={(event) => setGithubClientId(event.target.value)} placeholder={t("Client ID deiner OAuth App")} disabled={busy} /></label>
          <p className="modal-hint">{t("Für Browser-Anmeldung eine GitHub OAuth App mit aktiviertem Device Flow verwenden. Die Client ID ist in den OAuth-App-Einstellungen zu finden.")}</p>
          {deviceFlow && <div className="device-code"><span>{t("Im Browser auf")} <strong>{deviceFlow.verificationUri}</strong>  {t("eingeben:")}</span><code>{deviceFlow.userCode}</code><small>{t("Warte auf die Bestätigung …")}</small></div>}
          <button type="button" className="button button-subtle oauth-button" disabled={busy || !githubClientId.trim()} onClick={() => void startBrowserLogin()}><Github size={14} />  {t("Mit GitHub im Browser anmelden")}</button>
          <div className="auth-divider"><span>{t("ODER MIT TOKEN")}</span></div>
          <label>{t("Personal Access Token")}<input type="password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder={t("ghp_… oder github_pat_…")} disabled={busy} /></label>
          <p className="modal-hint">{t("Benötigt Repository-Lesezugriff und Berechtigung zum Erstellen von Pull Requests. Der Token wird unter Windows verschlüsselt gespeichert.")}</p>
          <p className="modal-hint">{t("„Verbinden“ verwendet den eingetragenen Token oder startet ohne Token die Browser-Anmeldung mit der Client ID.")}</p>
          <div className="modal-actions"><button type="submit" className="button button-primary" disabled={busy || (!githubToken.trim() && !githubClientId.trim())}><Github size={14} /> {busy ? t("Verbinde …") : t("Verbinden")}</button></div>
        </form>
      )}
    />
  ) : null

  if (!workspace) {
    return (
      <main className="welcome-screen">
        <button className="icon-button welcome-settings" title={t("Einstellungen")} aria-label={t("Einstellungen")} onClick={() => setSettingsOpen(true)} disabled={starting}><Settings2 size={18} /></button>
        <div className="welcome-card">
          <div className="brand-mark"><GitBranch size={28} /></div>
          <span className="eyebrow">{t("VERSION CONTROL CENTER")}</span>
          <h1>{t("Dein Git-Workspace.")}<br /><span>{t("Alles im Blick.")}</span></h1>
          <p>{t("Repositories, Änderungen und Commits an einem Ort — bereit für deinen nächsten Schritt.")}</p>
          <button className="button button-primary welcome-action" onClick={() => void createWorkspace()} disabled={openingRecent || starting}>
            <Plus size={16} />  {t("Workspace erstellen")} </button>
          <button className="button button-quiet welcome-open" onClick={() => void openWorkspace()} disabled={openingRecent || starting}>
             {t("Workspace öffnen")} </button>
          {recentWorkspaces.length > 0 && (
            <section className="recent-workspaces">
              <div className="recent-heading"><Clock3 size={14} /><span>{t("Zuletzt geöffnet")}</span></div>
              <div className="recent-list">
                {recentWorkspaces.slice(0, 8).map((recent) => (
                  <button
                    className="recent-item"
                    key={recent.path}
                    title={recent.path}
                    onClick={() => void openRecentWorkspace(recent.path)}
                    disabled={openingRecent || starting}
                  >
                    <span className="recent-icon"><Folder size={16} /></span>
                    <span className="recent-details">
                      <strong>{recent.name}</strong>
                      <small>{recent.path}</small>
                    </span>
                    <span className="recent-date">{new Date(recent.lastOpenedAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="welcome-foot"><span className="online-dot" />  {t("Lokal auf deinem Gerät gespeichert")}</div>
          {starting && <p role="status">{t("Einstellungen werden geladen …")}</p>}
          {error && <div className="notice notice-error welcome-error"><X size={15} />{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
        </div>
        <span className="welcome-version">{t("VCC · WINDOWS PREVIEW")}</span>
        {settingsDialog}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="workspace-header">
          <WorkspaceSwitcher
            name={workspace.name}
            path={workspacePath}
            workspaces={recentWorkspaces}
            disabled={openingRecent || busy}
            onRefresh={async () => {
              try {
                setRecentWorkspaces(await window.vcc.getRecentWorkspaces())
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason))
              }
            }}
            onSelect={openRecentWorkspace}
            onOpen={openWorkspace}
            onCreate={createWorkspace}
            onEdit={() => setWorkspaceEditorOpen(true)}
          />
          <button className="icon-button" title={t("Einstellungen")} aria-label={t("Einstellungen")} onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></button>
        </div>

        <div className="section-heading">
          <span>{t("REPOSITORIES")} <i>{repositories.length}</i></span>
          <div className="repository-controls">
            <button className="icon-button" title={t("Ordner durchsuchen")} aria-label={t("Ordner durchsuchen")} onClick={() => void scanRepositories()}><Search size={15} /></button>
            <button className="icon-button" title={t("Repository hinzufügen")} aria-label={t("Repository hinzufügen")} onClick={() => void addRepositories()}><Plus size={15} /></button>
          </div>
        </div>
        <label className="search-box">
          <Search size={14} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("Repository suchen")} />
          <kbd>{t("Ctrl K")}</kbd>
        </label>
        <div className="repo-list">
          {visibleRepositories.map((repo) => (
            <button
              key={repo.path}
              className={`repo-item ${repo.path === selectedPath ? 'active' : ''}`}
              onClick={() => selectRepository(repo)}
              title={repo.path}
            >
              <span className={`repo-state ${repo.isClean ? 'clean' : ''}`}><CircleDot size={15} /></span>
              <span className="repo-label"><strong>{repo.name}</strong><small><GitBranch size={11} /> {repo.branch}</small></span>
              {repo.changed > 0 && <span className="change-count">{repo.changed}</span>}
            </button>
          ))}
          {!visibleRepositories.length && (
            <div className="empty-repos">
              <Folder size={19} />
              <span>{repositories.length ? t('Keine Treffer.') : t('Noch keine Repositories.')}</span>
            </div>
          )}
        </div>
        <div className="sidebar-workspace-actions">
          <div className="sidebar-actions-heading"><Activity size={13} />  {t("Workspace-Aktionen")}</div>
          <div className="sidebar-actions-buttons">
            <button title={t("Alle Repositories fetchen")} onClick={() => sync('fetch', true)} disabled={busy}><RefreshCw size={13} /><span>{t("Fetch")}</span></button>
            <button title={t("Alle Repositories pullen")} onClick={() => sync('pull', true)} disabled={busy}><ArrowDownToLine size={13} /><span>{t("Pull")}</span></button>
            <button title={t("Alle Repositories pushen")} onClick={() => sync('push', true)} disabled={busy}><ArrowUpFromLine size={13} /><span>{t("Push")}</span></button>
          </div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="repo-title">
            <span className="repo-title-icon"><Code2 size={18} /></span>
            <div><h2>{selectedRepository?.name ?? t('Workspace-Übersicht')}</h2><span title={selectedRepository?.path ?? workspacePath}>{selectedRepository?.path ?? workspacePath}</span></div>
          </div>
          <div className="top-actions">
            <div className="location-actions">
              <button className="icon-button" title={t("Repository-Ordner im Explorer öffnen")} aria-label={t("Repository-Ordner im Explorer öffnen")} onClick={() => void openRepositoryLocation('explorer')} disabled={!selectedPath}>
                <FolderOpen size={15} />
              </button>
              <button className="icon-button" title={t("Git Bash im Repository öffnen")} aria-label={t("Git Bash im Repository öffnen")} onClick={() => void openRepositoryLocation('bash')} disabled={!selectedPath}>
                <Terminal size={15} />
              </button>
              <button className="icon-button" title={t('Repository auf GitHub öffnen')} aria-label={t('Repository auf GitHub öffnen')} onClick={() => void openRepositoryLocation('remote')} disabled={!selectedPath}>
                <Github size={15} />
              </button>
            </div>
            <div className="branch-pill"><GitBranch size={14} /><span>{selectedRepository?.branch ?? t("Kein Repository")}</span></div>
          </div>
        </header>

        {error && <div className="notice notice-error"><X size={15} />{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
        {notice && !error && <div className="notice notice-success"><Check size={15} />{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}

        {!selectedPath ? (
          <div className="empty-state">
            <div className="empty-illustration"><Folder size={27} /></div>
            <h3>{t("Dein Workspace ist bereit.")}</h3>
            <p>{t("Füge ein Repository hinzu oder durchsuche einen Ordner rekursiv nach Git-Repositories.")}</p>
            <div><button className="button button-primary" onClick={() => void addRepositories()}><Plus size={15} />  {t("Repository hinzufügen")}</button><button className="button button-subtle" onClick={() => void scanRepositories()}><Search size={15} />  {t("Ordner durchsuchen")}</button></div>
          </div>
        ) : (
          <>
            <nav className="tabs">
              <button className={tab === 'changes' ? 'selected' : ''} onClick={() => setTab('changes')}><ArrowLeftRight size={15} />  {t("Änderungen")} <span>{details?.files.length ?? 0}</span></button>
              <button className={tab === 'unpushed' ? 'selected' : ''} onClick={() => setTab('unpushed')}><ArrowUpFromLine size={15} /> {t('Ungepushte Commits')} <span>{unpushedLoading ? '…' : unpushed && unpushed.comparison !== 'detached' ? unpushed.commits.length : '—'}</span></button>
              <button className={tab === 'log' ? 'selected' : ''} onClick={() => setTab('log')}><History size={15} />  {t("Git-Log")}</button>
              <div className="tabs-spacer" />
              <span className="last-updated">{busy || detailsLoading ? t("Wird geladen …") : t("{0} voraus · {1} zurück", details?.summary.ahead ?? 0, details?.summary.behind ?? 0)}</span>
              <div className="git-actions">
                <button className="button button-subtle" onClick={() => sync('fetch')} disabled={busy}><RefreshCw size={14} /> {t("Fetch")}</button>
                <button className="button button-subtle" onClick={() => sync('pull')} disabled={busy}><ArrowDownToLine size={14} /> {t("Pull")}</button>
                <button className="button button-subtle" onClick={() => sync('push')} disabled={busy}><ArrowUpFromLine size={14} /> {t("Push")}</button>
                <span className="action-separator" />
                <button className="icon-button" title={t("Branch aus Branch erstellen")} aria-label={t("Branch aus Branch erstellen")} onClick={() => void showBranchDialog()} disabled={busy}><GitBranch size={16} /></button>
                <button className="button button-primary" onClick={() => { setPrTitle(''); setPrBody(''); setDialog('pull-request') }} disabled={busy}><Github size={15} /> {t("Pull Request")}</button>
              </div>
            </nav>

            {tab === 'changes' ? (
              <ResizableChangesLayout>
                <div className="changes-panel">
                  <div className="panel-heading">
                    <div><strong>{t("Lokale Änderungen")}</strong><span>{details?.files.length ?? 0}  {t("Dateien")}</span></div>
                    <div>
                      <ChangesViewOptions grouped={groupByDirectory} onChange={setGroupByDirectory} />
                      <button className="icon-button" title={t("Änderungen aktualisieren")} onClick={() => setStatusRevision((revision) => revision + 1)}><RefreshCw size={14} /></button>
                    </div>
                  </div>
                  {details?.files.length ? (
                    <div className="file-list">
                      {groupByDirectory ? (
                        <FileTree
                          key={selectedPath}
                          directory={fileTree}
                          rootName={selectedRepository?.name ?? details.summary.name}
                          activePath={activeDiffPath}
                          onSelect={(file) => void loadDiff(file)}
                          onToggle={stageFile}
                          onDiscard={discardFile}
                          disabled={busy}
                        />
                      ) : details.files.map((file) => (
                        <FileRow
                          key={file.path}
                          file={file}
                          selected={activeDiffPath === file.path}
                          onSelect={() => void loadDiff(file)}
                          onToggle={() => stageFile(file)}
                          onDiscard={() => discardFile(file)}
                          disabled={busy}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="clean-state">
                      {detailsLoading ? <><RefreshCw size={17} /><strong>{t("Dateien werden geladen …")}</strong></> : details ? <><span className="clean-check"><Check size={17} /></span><strong>{t("Alles aufgeräumt")}</strong><span>{t("Keine lokalen Änderungen vorhanden.")}</span></> : <strong>{t("Dateien konnten nicht geladen werden.")}</strong>}
                    </div>
                  )}
                  <div className="commit-box">
                    <div className="commit-title"><GitCommitHorizontal size={16} /><strong>{t("Commit erstellen")}</strong></div>
                    <textarea value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder={t("Commit-Nachricht eingeben …")} rows={3} />
                    <div className="commit-footer"><span>{details?.summary.staged ?? 0}  {t("Dateien vorgemerkt")}</span><button className="button button-primary" onClick={commit} disabled={!details?.summary.staged || !commitMessage.trim() || busy}><GitCommitHorizontal size={14} />  {t("Commit")}</button></div>
                  </div>
                </div>
                <div className="diff-panel">
                  <div className="panel-heading"><div><strong>{t("Änderungsansicht")}</strong><span>{t("Ausgewählte Datei")}</span></div><span className="diff-language"><FileCode2 size={13} />  {t("DIFF")}</span></div>
                  <DiffView
                    files={details?.files ?? []}
                    diffs={diffs}
                    activePath={activeDiffPath}
                    selectedHunks={selectedHunks}
                    onSelectHunk={(path, index) => setSelectedHunks((current) => {
                      const next = current[path] ?? []
                      return { ...current, [path]: next.includes(index) ? next.filter((item) => item !== index) : [...next, index] }
                    })}
                    onStageHunks={stageChosenHunks}
                  />
                </div>
              </ResizableChangesLayout>
            ) : (
              <div className="log-panel">
                {tab === 'unpushed' ? (
                  <>
                    <div className="panel-heading"><div><strong>{t('Ungepushte Commits')}</strong><span>{unpushed?.upstream ?? ''}</span></div><button className="icon-button" title={t('Aktualisieren')} aria-label={t('Aktualisieren')} disabled={busy || unpushedLoading} onClick={() => setStatusRevision((revision) => revision + 1)}><RefreshCw size={14} /></button></div>
                    <div className="unpushed-hint">{t(unpushed?.comparison === 'remotes'
                      ? 'Kein Upstream eingerichtet. Angezeigt werden Commits, die in keinem lokal bekannten Remote-Branch enthalten sind. Fetch aktualisiert den Remote-Stand.'
                      : 'Vergleich mit dem lokal bekannten Upstream-Stand. Fetch aktualisiert den Remote-Stand.')}</div>
                    {unpushedLoading ? <div className="clean-state"><RefreshCw size={17} /><strong>{t('Commits werden geladen …')}</strong></div>
                      : unpushedError ? <div className="notice notice-error" role="alert">{unpushedError}</div>
                        : unpushed?.comparison === 'detached' ? <div className="clean-state"><GitBranch size={20} /><strong>{t('Kein Branch ausgecheckt (Detached HEAD). Bitte zuerst einen Branch auschecken.')}</strong></div>
                          : unpushed && !unpushed.commits.length ? <div className="clean-state"><Check size={20} /><strong>{t('Keine ungepushten Commits')}</strong></div>
                            : unpushed ? <CommitHistory key={`${workspacePath}:${selectedPath}:unpushed`} repositoryPath={selectedPath} commits={unpushed.commits} /> : null}
                  </>
                ) : (
                  <>
                    <div className="panel-heading"><div><strong>{t("Commit-Historie")}</strong><span>{t("Letzte")} {commits.length}  {t("Commits")}</span></div></div>
                    {logLoading ? <div className="clean-state"><RefreshCw size={17} /><strong>{t("Historie wird geladen …")}</strong></div> : <CommitHistory key={`${workspacePath}:${selectedPath}:log`} repositoryPath={selectedPath} commits={commits} />}
                  </>
                )}
              </div>
            )}
          </>
        )}
        <footer className="statusbar"><span><span className="online-dot" />  {t("Bereit")}</span><span><span role="status" className={`github-status ${hasToken ? 'connected' : ''}`}><Github size={12} />{hasToken ? t("GitHub verbunden") : t("GitHub nicht verbunden")}</span><span className="status-branch"><GitBranch size={12} />{selectedRepository?.branch ?? '—'}</span><span>{t("UTF-8")}</span><span>{t("Windows")}</span></span></footer>
      </section>

      {settingsDialog}
      {workspaceEditorOpen && <WorkspaceEditor
        workspace={workspace}
        onClose={() => setWorkspaceEditorOpen(false)}
        onSaved={(saved) => {
          setWorkspace(saved)
          setWorkspaceEditorOpen(false)
          setError('')
          void refresh(saved.repositories).catch((reason: Error) => setError(reason.message))
          void window.vcc.getRecentWorkspaces().then(setRecentWorkspaces).catch((reason: Error) => setError(reason.message))
        }}
      />}
      {dialog && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setDialog(null)
          }
        }}>
          {dialog === 'branch' && (
            <form className="modal-card" onSubmit={(event) => void createBranch(event)}>
              <div className="modal-heading"><div className="modal-icon"><GitBranch size={18} /></div><div><h3>{t("Neuen Branch erstellen")}</h3><p>{t("Wechselt nach dem Erstellen direkt in den neuen Branch.")}</p></div><button type="button" className="icon-button" onClick={() => setDialog(null)}><X size={16} /></button></div>
              <label>{t("Branch-Name")}<input autoFocus value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder={t("feature/mein-feature")} /></label>
              <label>{t("Ausgehend von")}<input value={baseBranch} onChange={(event) => setBaseBranch(event.target.value)} placeholder={t("main")} /></label>
              <p className="modal-hint">{t("Nicht committete Änderungen werden automatisch zwischengespeichert und danach wiederhergestellt.")}</p>
              <div className="modal-actions"><button type="button" className="button button-subtle" onClick={() => setDialog(null)}>{t("Abbrechen")}</button><button className="button button-primary" disabled={busy || !branchName.trim()}><GitBranch size={14} />  {t("Branch erstellen")}</button></div>
            </form>
          )}
          {dialog === 'pull-request' && (
            <form className="modal-card" onSubmit={(event) => void createPullRequest(event)}>
              <div className="modal-heading"><div className="modal-icon"><Github size={18} /></div><div><h3>{t("Pull Request erstellen")}</h3><p>{t("GitHub · Zielbranch wird automatisch ermittelt")}</p></div><button type="button" className="icon-button" onClick={() => setDialog(null)}><X size={16} /></button></div>
              {!hasToken && <div className="inline-warning">{t("Verbinde zuerst dein GitHub-Konto in den Einstellungen im Tab „GitHub“ per Browser oder Token.")}</div>}
              <label>{t("Titel")}<input autoFocus value={prTitle} onChange={(event) => setPrTitle(event.target.value)} placeholder={t("Was ändert dieser Pull Request?")} /></label>
              <label>{t("Beschreibung")}<textarea value={prBody} onChange={(event) => setPrBody(event.target.value)} placeholder={t("Optional")} rows={4} /></label>
              <p className="modal-hint">{t("Der aktuelle Branch muss zuvor manuell zu GitHub gepusht werden.")}</p>
              <div className="modal-actions"><button type="button" className="button button-subtle" onClick={() => setDialog(null)}>{t("Abbrechen")}</button><button type="submit" className="button button-primary" disabled={busy || !prTitle.trim() || !hasToken}><Github size={14} />  {t("Pull Request erstellen")}</button></div>
            </form>
          )}
        </div>
      )}
    </main>
  )
}

interface FileTreeProps {
  directory: FileTreeDirectory
  rootName?: string
  activePath: string
  onSelect: (file: ChangedFile) => void
  onToggle: (file: ChangedFile) => void
  onDiscard: (file: ChangedFile) => void
  disabled: boolean
}

function FileTree({ directory, rootName, activePath, onSelect, onToggle, onDiscard, disabled }: FileTreeProps): JSX.Element {
  return (
    <details className="file-group" open>
      <summary title={directory.path || rootName}>
        <ChevronRight className="file-group-chevron" size={13} />
        <Folder size={14} />
        <span>{rootName ?? directory.name}</span>
        <small>{directory.count}</small>
      </summary>
      <div className="file-group-children">
        {[...directory.directories.values()].sort((left, right) => left.name.localeCompare(right.name)).map((child) => (
          <FileTree key={child.path} directory={child} activePath={activePath} onSelect={onSelect} onToggle={onToggle} onDiscard={onDiscard} disabled={disabled} />
        ))}
        {[...directory.files].sort((left, right) => left.path.localeCompare(right.path)).map((file) => (
          <FileRow key={file.path} file={file} selected={activePath === file.path} onSelect={() => onSelect(file)} onToggle={() => onToggle(file)} onDiscard={() => onDiscard(file)} disabled={disabled} />
        ))}
      </div>
    </details>
  )
}

interface FileRowProps {
  file: ChangedFile
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onDiscard: () => void
  disabled: boolean
}

function FileRow({ file, selected, onSelect, onToggle, onDiscard, disabled }: FileRowProps): JSX.Element {
  const { t } = useTranslation()
  const normalizedPath = file.path.replaceAll('\\', '/')
  const separator = normalizedPath.lastIndexOf('/')
  const fileName = normalizedPath.slice(separator + 1)
  const state = file.status === '?' ? 'U' : file.status === 'D' ? 'D' : file.status === 'R' ? 'R' : file.status === 'A' ? 'A' : 'M'
  return (
    <div className={`file-row ${selected ? 'current' : ''}`}>
      <button className="file-main" onClick={onSelect} aria-pressed={selected} title={normalizedPath}>
        <span className={`file-status state-${state.toLowerCase()}`}>{state}</span>
        <span className="file-names"><strong>{fileName}</strong></span>
      </button>
      <button className="icon-button discard-file" title={t('Änderungen verwerfen')} aria-label={t('Änderungen an „{0}“ verwerfen', file.path)} disabled={disabled} onClick={onDiscard}><Undo2 size={13} /></button>
      <button className={`stage-toggle ${file.staged ? 'checked' : ''}`} title={file.staged ? t("Aus Commit entfernen") : t("Datei vormerken")} disabled={disabled} onClick={onToggle}>
        {file.staged ? <Check size={12} /> : <Plus size={12} />}
      </button>
    </div>
  )
}

interface DiffViewProps {
  files: ChangedFile[]
  diffs: Record<string, string>
  activePath: string
  selectedHunks: Record<string, number[]>
  onSelectHunk: (path: string, index: number) => void
  onStageHunks: (path: string) => void
  readOnly?: boolean
}

function DiffView({ files, diffs, activePath, selectedHunks, onSelectHunk, onStageHunks, readOnly = false }: DiffViewProps): JSX.Element {
  const { t } = useTranslation()
  const currentFile = files.find((file) => file.path === activePath && diffs[file.path] !== undefined)
  if (!currentFile) return <div className="diff-empty"><div><FileCode2 size={23} /><span>{t("Wähle eine Datei aus, um den Unterschied anzuzeigen.")}</span></div></div>
  const patch = diffs[currentFile.path]
  const lines = patch?.split('\n') ?? []
  const firstHunk = lines.findIndex((line) => line.startsWith('@@ '))
  const header = firstHunk < 0 ? lines : lines.slice(0, firstHunk)
  const hunks: string[][] = []
  for (const line of firstHunk < 0 ? [] : lines.slice(firstHunk)) {
    if (line.startsWith('@@ ')) hunks.push([line])
    else if (hunks.length) hunks[hunks.length - 1].push(line)
  }
  const chosen = selectedHunks[currentFile.path] ?? []
  const canStageHunks = !currentFile.staged || currentFile.workingDir !== ' '
  return (
    <DiffHorizontalScroll key={currentFile.path}>
      <div className="diff-file-heading"><FileCode2 size={14} /><strong>{currentFile.path}</strong><span>{currentFile.status}</span></div>
      <div className="diff-columns-heading"><span>{t("VORHER")}</span><span>{t("NACHHER")}</span></div>
      {header.filter((line) => line.startsWith('diff ') || line.startsWith('index ')).map((line, index) => (
        <div className="diff-line diff-meta" key={`meta-${index}`}>{line}</div>
      ))}
      {hunks.map((hunk, index) => (
        <section className="diff-hunk" key={`hunk-${index}`}>
          <div className="diff-hunk-heading">
            <span>{hunk[0]}</span>
            {!readOnly && <button className={`hunk-select ${chosen.includes(index) ? 'active' : ''}`} onClick={() => onSelectHunk(currentFile.path, index)}>
              {chosen.includes(index) ? <Check size={11} /> : <Plus size={11} />}  {t("Block")} {index + 1}
            </button>}
          </div>
          <SideBySideHunk hunk={hunk} />
        </section>
      ))}
      {patch && !hunks.length && <div className="diff-empty compact">{patch}</div>}
      {patch === '' && <div className="diff-empty compact">{t(readOnly ? 'Keine Textänderungen in dieser Datei.' : 'Diese Datei hat keine nicht vorgemerkten Änderungen mehr.')}</div>}
      {!readOnly && !!chosen.length && canStageHunks && <div className="stage-hunks-bar"><span>{chosen.length}  {t("Änderungsblock/-blöcke ausgewählt")}</span><button className="button button-primary" onClick={() => onStageHunks(currentFile.path)}><Plus size={13} />  {t("Auswahl vormerken")}</button></div>}
      {!readOnly && !patch && <div className="diff-empty compact">{t("Diese Datei ist neu oder binär. Sie kann über das Häkchen als ganze Datei vorgemerkt werden.")}</div>}
    </DiffHorizontalScroll>
  )
}

interface DiffRow {
  oldText: string | null
  newText: string | null
  oldLineNumber: number | null
  newLineNumber: number | null
  oldKind: 'context' | 'removed' | 'blank'
  newKind: 'context' | 'added' | 'blank'
}

function SideBySideHunk({ hunk }: { hunk: string[] }): JSX.Element {
  const rows: DiffRow[] = []
  const range = hunk[0].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  let oldLineNumber = range ? Number(range[1]) : 0
  let newLineNumber = range ? Number(range[2]) : 0
  let deleted: string[] = []
  let added: string[] = []

  const flushChanges = (): void => {
    const count = Math.max(deleted.length, added.length)
    for (let index = 0; index < count; index += 1) {
      const oldText = deleted[index] ?? null
      const newText = added[index] ?? null
      rows.push({
        oldText,
        newText,
        oldLineNumber: oldText === null ? null : oldLineNumber,
        newLineNumber: newText === null ? null : newLineNumber,
        oldKind: oldText === null ? 'blank' : 'removed',
        newKind: newText === null ? 'blank' : 'added'
      })
      if (oldText !== null) oldLineNumber += 1
      if (newText !== null) newLineNumber += 1
    }
    deleted = []
    added = []
  }

  for (const line of hunk.slice(1)) {
    if (line.startsWith('-')) {
      deleted.push(line.slice(1))
    } else if (line.startsWith('+')) {
      added.push(line.slice(1))
    } else if (line.startsWith(' ')) {
      flushChanges()
      rows.push({
        oldText: line.slice(1),
        newText: line.slice(1),
        oldLineNumber,
        newLineNumber,
        oldKind: 'context',
        newKind: 'context'
      })
      oldLineNumber += 1
      newLineNumber += 1
    } else if (line.startsWith('\\')) {
      flushChanges()
    }
  }
  flushChanges()

  return (
    <div className="diff-side-by-side">
      {rows.map((row, index) => (
        <div className="diff-side-row" key={index}>
          <DiffSideCell text={row.oldText} lineNumber={row.oldLineNumber} kind={row.oldKind} />
          <DiffSideCell text={row.newText} lineNumber={row.newLineNumber} kind={row.newKind} />
        </div>
      ))}
    </div>
  )
}

function DiffSideCell({ text, lineNumber: suppliedLineNumber, kind }: {
  text: string | null
  lineNumber: number | null
  kind: 'context' | 'removed' | 'added' | 'blank'
}): JSX.Element {
  return (
    <div className={`diff-side-cell ${kind}`}>
      <span className="diff-line-number">{suppliedLineNumber ?? ''}</span>
      <code><span>{text ?? ''}</span></code>
    </div>
  )
}

function CommitHistory({ commits, repositoryPath }: { commits: CommitSummary[]; repositoryPath: string }): JSX.Element {
  const { t, language } = useTranslation()
  const [selectedHash, setSelectedHash] = useState('')
  const [files, setFiles] = useState<CommitFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [patch, setPatch] = useState<string | null>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [patchLoading, setPatchLoading] = useState(false)
  const [filesError, setFilesError] = useState('')
  const [patchError, setPatchError] = useState('')

  useEffect(() => {
    let cancelled = false
    setFiles([])
    setSelectedFile('')
    setPatch(null)
    setFilesError('')
    setFilesLoading(Boolean(selectedHash))
    if (!selectedHash) return
    void window.vcc.getCommitFiles(repositoryPath, selectedHash)
      .then((result) => { if (!cancelled) { setFiles(result); setSelectedFile(result[0]?.path ?? '') } })
      .catch((reason: Error) => { if (!cancelled) setFilesError(reason.message) })
      .finally(() => { if (!cancelled) setFilesLoading(false) })
    return () => { cancelled = true }
  }, [selectedHash, repositoryPath])

  useEffect(() => {
    let cancelled = false
    setPatch(null)
    setPatchError('')
    setPatchLoading(Boolean(selectedHash && selectedFile))
    if (!selectedHash || !selectedFile) return
    void window.vcc.getCommitFileDiff(repositoryPath, selectedHash, selectedFile)
      .then((result) => { if (!cancelled) setPatch(result) })
      .catch((reason: Error) => { if (!cancelled) setPatchError(reason.message) })
      .finally(() => { if (!cancelled) setPatchLoading(false) })
    return () => { cancelled = true }
  }, [selectedHash, selectedFile, repositoryPath])

  const file = files.find((entry) => entry.path === selectedFile)
  const diffFiles: ChangedFile[] = file ? [{ path: file.path, status: file.status, index: ' ', workingDir: ' ', staged: false }] : []
  if (!commits.length) return <div className="clean-state"><Clock3 size={20} /><strong>{t("Noch keine Commits")}</strong><span>{t("Die Historie wird hier angezeigt.")}</span></div>
  return (
    <div className={`commit-browser ${selectedHash ? 'has-selection' : ''}`}>
    <div className="commit-list">
      {commits.map((commit, index) => (
        <button type="button" className={`commit-row ${selectedHash === commit.hash ? 'selected' : ''}`} key={commit.hash} aria-pressed={selectedHash === commit.hash} onClick={() => setSelectedHash(commit.hash)}>
          <div className="timeline"><span className={index === 0 ? 'latest' : ''} /><i /></div>
          <div className="commit-info"><strong>{commit.message}</strong><span>{commit.author}  {t("·")} {new Date(commit.date).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}</span></div>
          <code>{commit.hash.slice(0, 8)}</code>
        </button>
      ))}
    </div>
    {selectedHash && <div className="commit-inspector">
      <div className="panel-heading"><div><strong>{t('Dateien im Commit')}</strong><span>{selectedHash.slice(0, 8)}</span></div><button className="icon-button" aria-label={t('Schließen')} title={t('Schließen')} onClick={() => setSelectedHash('')}><X size={14} /></button></div>
      <div className="commit-comparison-note">{t('Schreibgeschützter Vergleich mit dem ersten Eltern-Commit; beim ersten Commit mit einem leeren Stand.')}</div>
      {filesLoading ? <div className="clean-state">{t('Dateien werden geladen …')}</div>
        : filesError ? <div className="notice notice-error" role="alert">{filesError}</div>
          : !files.length ? <div className="clean-state">{t('Dieser Commit enthält keine Dateiänderungen.')}</div>
            : <div className="commit-details-layout">
              <div className="commit-files">{files.map((entry) => <button key={entry.path} className={entry.path === selectedFile ? 'selected' : ''} aria-pressed={entry.path === selectedFile} title={entry.previousPath ? `${entry.previousPath} → ${entry.path}` : entry.path} onClick={() => setSelectedFile(entry.path)}><span className="file-status">{entry.status}</span><span>{entry.previousPath ? `${entry.previousPath} → ${entry.path}` : entry.path}</span></button>)}</div>
              <div className="diff-panel">
                {patchLoading ? <div className="clean-state">{t('Vergleich wird geladen …')}</div>
                  : patchError ? <div className="notice notice-error" role="alert">{patchError}</div>
                    : patch !== null ? <DiffView files={diffFiles} diffs={{ [selectedFile]: patch }} activePath={selectedFile} selectedHunks={{}} onSelectHunk={() => {}} onStageHunks={() => {}} readOnly /> : null}
              </div>
            </div>}
    </div>}
    </div>
  )
}

export default App
