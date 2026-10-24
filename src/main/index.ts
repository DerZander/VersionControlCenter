import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { simpleGit, type SimpleGit } from 'simple-git'
import { defaultSettings } from '../shared/types'
import { getCommitFiles, getCommitFileDiff } from './commitDetails'
import { translate, type Language, type TranslationKey } from '../shared/i18n'
import type {
  AppSettings,
  ChangedFile,
  CommitSummary,
  DeviceFlowInfo,
  DeviceFlowPollResult,
  PullRequestResult,
  RecentWorkspace,
  RepositoryDetails,
  RepositorySummary,
  Workspace
} from '../shared/types'

const currentDir = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined
let language: Language = defaultSettings.language

function t(key: TranslationKey, ...values: (string | number)[]): string {
  return translate(language, key, ...values)
}
let workspacePath: string | undefined
let workspaceRepositories = new Map<string, string>()
let pendingDeviceFlow: {
  clientId: string
  deviceCode: string
  expiresAt: number
  interval: number
} | undefined

function createWindow(): void {
  Menu.setApplicationMenu(null)
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#111318',
    title: 'Version Control Center',
    webPreferences: {
      preload: join(currentDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(currentDir, '../renderer/index.html'))
  }
}

async function syncRepository(path: string, action: 'fetch' | 'pull' | 'push'): Promise<void> {
  const git = await assertRepository(path)
  if (action === 'fetch') {
    await git.fetch()
    return
  }
  const branch = (await git.raw(['branch', '--show-current'])).trim()
  if (!branch) throw new Error(t("Kein Branch ausgecheckt (Detached HEAD). Bitte zuerst einen Branch auschecken."))
  const upstream = (await git.raw(['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`])).trim()
  if (upstream) {
    if (action === 'pull') await git.pull()
    else await git.push()
    return
  }

  const remotes = await git.getRemotes()
  if (!remotes.length) throw new Error(t("Für „{0}“ ist kein Remote eingerichtet. Bitte zuerst ein Git-Remote hinzufügen.", branch))
  const matching: string[] = []
  for (const remote of remotes) {
    const result = await git.raw(['ls-remote', '--heads', remote.name, `refs/heads/${branch}`])
    if (result.trim()) matching.push(remote.name)
  }
  if (matching.length > 1 || (!matching.length && remotes.length > 1 && action === 'push')) {
    throw new Error(t("Für „{0}“ ist die Remote-Zuordnung nicht eindeutig. Bitte den gewünschten Upstream mit git branch --set-upstream-to=<remote>/{1} festlegen.", branch, branch))
  }
  if (action === 'pull') {
    if (!matching.length) {
      throw new Error(t("Der Branch „{0}“ wurde noch auf keinem Remote gefunden. Bitte zuerst manuell Push ausführen, um ihn zu veröffentlichen und den Upstream einzurichten.", branch))
    }
    const remote = matching[0]
    await git.raw(['fetch', remote, `refs/heads/${branch}:refs/remotes/${remote}/${branch}`])
    await git.raw(['branch', `--set-upstream-to=${remote}/${branch}`, branch])
    await git.pull()
  } else {
    const remote = matching[0] ?? remotes[0].name
    await git.raw(['push', '--set-upstream', remote, `HEAD:refs/heads/${branch}`])
  }
}

function safeFilePaths(root: string, paths: string[]): string[] {
  if (!Array.isArray(paths) || !paths.length || !paths.every((path) => typeof path === 'string' && path.length > 0)) {
    throw new Error(t("Die Dateiauswahl ist ungültig."))
  }
  return paths.map((path) => {
    const resolvedPath = resolve(root, path)
    const pathFromRoot = relative(root, resolvedPath)
    if (
      !pathFromRoot ||
      pathFromRoot === '..' ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      throw new Error(t("Dateien außerhalb des Repositories können nicht verwendet werden."))
    }
    return pathFromRoot.split(sep).join('/')
  })
}

function normalizePath(path: string): string {
  return resolve(path).toLocaleLowerCase('en-US')
}

async function untrackedFilePatch(root: string, file: string): Promise<string> {
  const content = await fs.readFile(resolve(root, file))
  if (content.length > 1024 * 1024) return t("Textvorschau ausgelassen (Datei größer als 1 MiB).")
  if (content.includes(0)) return t("Binärdatei: Eine Textvorschau ist nicht verfügbar.")

  const text = content.toString('utf8')
  const hasFinalNewline = text.endsWith('\n')
  const lines = text.split(/\r?\n/)
  if (hasFinalNewline) lines.pop()
  if (!text.length) lines.length = 0
  const quotePath = (value: string): string => {
    if (/^[A-Za-z0-9_./-]+$/.test(value)) return value
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t')}"`
  }
  const filePath = file.replace(/\\/g, '/')
  const oldPath = quotePath(`a/${filePath}`)
  const newPath = quotePath(`b/${filePath}`)
  if (!lines.length) return ''
  const hunk = [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)]
  if (!hasFinalNewline) hunk.push('\\ No newline at end of file')
  return [
    `diff --git ${oldPath} ${newPath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ ${newPath}`,
    ...hunk
  ].join('\n') + '\n'
}

function gitAt(path: string): SimpleGit {
  if (typeof path !== 'string' || !path.trim()) throw new Error(t("Repository-Pfad ist ungültig."))
  return simpleGit({ baseDir: resolve(path), binary: 'git', maxConcurrentProcesses: 1 })
}

async function assertRepository(path: string): Promise<SimpleGit> {
  if (!workspacePath) throw new Error(t("Es ist kein Workspace geöffnet."))
  const registeredPath = workspaceRepositories.get(normalizePath(path))
  if (!registeredPath) throw new Error(t("Dieses Repository gehört nicht zum geöffneten Workspace."))
  return gitAt(registeredPath)
}

function workspaceNameFromPath(path: string): string {
  return basename(path, '.vcc-workspace.json')
}

function validateSettings(value: unknown): AppSettings {
  if (
    !value || typeof value !== 'object' ||
    !('defaultWorkspace' in value) ||
    (value.defaultWorkspace !== null && (typeof value.defaultWorkspace !== 'string' || !isAbsolute(value.defaultWorkspace))) ||
    !('theme' in value) || (value.theme !== 'dark' && value.theme !== 'light') ||
    !('uiFontSize' in value) || typeof value.uiFontSize !== 'number' ||
    !Number.isInteger(value.uiFontSize) || value.uiFontSize < 12 || value.uiFontSize > 18 ||
    !('codeFontSize' in value) || typeof value.codeFontSize !== 'number' ||
    !Number.isInteger(value.codeFontSize) || value.codeFontSize < 10 || value.codeFontSize > 24
    || ('language' in value && value.language !== 'de' && value.language !== 'en')
    || ('changesView' in value && value.changesView !== 'files' && value.changesView !== 'modules')
  ) {
    throw new Error(t("Die Anwendungseinstellungen sind ungültig."))
  }
  return {
    defaultWorkspace: value.defaultWorkspace === null ? null : resolve(value.defaultWorkspace),
    theme: value.theme,
    uiFontSize: value.uiFontSize,
    codeFontSize: value.codeFontSize,
    language: 'language' in value ? value.language === 'de' ? 'de' : 'en' : defaultSettings.language,
    changesView: 'changesView' in value ? value.changesView === 'files' ? 'files' : 'modules' : defaultSettings.changesView
  }
}

async function readSettings(): Promise<AppSettings> {
  try {
    const settings = validateSettings(JSON.parse(await fs.readFile(join(app.getPath('userData'), 'settings.json'), 'utf8')))
    language = settings.language
    return settings
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      language = defaultSettings.language
      return { ...defaultSettings }
    }
    throw error
  }
}

async function activateWorkspace(path: string): Promise<{ path: string; workspace: Workspace }> {
  const workspace = await readWorkspace(path)
  await rememberWorkspace(path, workspace)
  workspacePath = path
  workspaceRepositories = new Map(workspace.repositories.map((repository) => [normalizePath(repository), repository]))
  return { path, workspace }
}

function recentWorkspacesPath(): string {
  return join(app.getPath('userData'), 'recent-workspaces.json')
}

async function loadRecentWorkspaces(): Promise<RecentWorkspace[]> {
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(recentWorkspacesPath(), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  if (!Array.isArray(raw)) throw new Error(t("Die Liste der zuletzt geöffneten Workspaces ist ungültig."))

  const available: RecentWorkspace[] = []
  let removedMissing = false
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('path' in item) ||
      typeof item.path !== 'string' ||
      !('name' in item) ||
      typeof item.name !== 'string' ||
      !('lastOpenedAt' in item) ||
      typeof item.lastOpenedAt !== 'string'
    ) {
      continue
    }
    try {
      await fs.access(item.path)
      available.push({ path: resolve(item.path), name: item.name, lastOpenedAt: item.lastOpenedAt })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        removedMissing = true
        continue
      }
      throw error
    }
  }

  const unique = [...new Map(available.map((workspace) => [workspace.path.toLocaleLowerCase('en-US'), workspace])).values()]
  if (removedMissing || unique.length !== available.length) {
    await fs.writeFile(recentWorkspacesPath(), JSON.stringify(unique, null, 2), 'utf8')
  }
  return unique
}

async function rememberWorkspace(path: string, workspace: Workspace): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  const next: RecentWorkspace = {
    path: resolve(path),
    name: workspace.name,
    lastOpenedAt: new Date().toISOString()
  }
  const recent = await loadRecentWorkspaces()
  const normalizedPath = next.path.toLocaleLowerCase('en-US')
  const updated = [
    next,
    ...recent.filter((item) => item.path.toLocaleLowerCase('en-US') !== normalizedPath)
  ]
  await fs.writeFile(recentWorkspacesPath(), JSON.stringify(updated, null, 2), 'utf8')
}

async function readWorkspace(path: string): Promise<Workspace> {
  const raw: unknown = JSON.parse(await fs.readFile(path, 'utf8'))
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('repositories' in raw) ||
    !Array.isArray(raw.repositories) ||
    !raw.repositories.every((item) => typeof item === 'string')
  ) {
    throw new Error(t("Die Workspace-Datei hat ein ungültiges Format."))
  }
  return {
    name: 'name' in raw && typeof raw.name === 'string' ? raw.name : workspaceNameFromPath(path),
    repositories: [...new Set(raw.repositories.map((item) => resolve(item)))]
  }
}

async function saveWorkspace(repositories: string[], name?: string): Promise<Workspace> {
  if (!workspacePath) throw new Error(t("Es ist kein Workspace geöffnet."))
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) throw new Error(t('Bitte gib einen Workspace-Namen ein.'))
  if (!Array.isArray(repositories) || !repositories.every((path) => typeof path === 'string')) {
    throw new Error(t("Die Repository-Liste ist ungültig."))
  }
  const normalized: string[] = []
  for (const path of repositories) {
    const git = gitAt(path)
    if (!(await git.checkIsRepo())) throw new Error(t("Kein Git-Repository: {0}", path))
    normalized.push((await git.revparse(['--show-toplevel'])).trim())
  }
  const workspace: Workspace = {
    name: name === undefined ? (await readWorkspace(workspacePath)).name : name.trim(),
    repositories: [...new Set(normalized)]
  }
  const temporary = join(dirname(workspacePath), `.vcc-${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, JSON.stringify(workspace, null, 2), 'utf8')
    await fs.rename(temporary, workspacePath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  workspaceRepositories = new Map(workspace.repositories.map((path) => [normalizePath(path), path]))
  await rememberWorkspace(workspacePath, workspace)
  return workspace
}

async function findRepositories(folder: string): Promise<string[]> {
  const found: string[] = []
  const ignored = new Set(['.git', 'node_modules', 'out', 'dist'])

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    if (entries.some((entry) => entry.name === '.git')) {
      found.push(directory)
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || ignored.has(entry.name)) continue
      await visit(join(directory, entry.name))
    }
  }

  await visit(resolve(folder))
  return found
}

function summaryFromStatus(path: string, status: Awaited<ReturnType<SimpleGit['status']>>): RepositorySummary {
  const root = workspaceRepositories.get(normalizePath(path)) ?? resolve(path)
  return {
    path: root,
    name: basename(root),
    branch: status.current || t('(kein Branch)'),
    ahead: status.ahead,
    behind: status.behind,
    upstream: status.tracking,
    changed: status.files.filter((file) => file.working_dir !== ' ' || file.index !== ' ').length,
    staged: status.files.filter((file) => file.index !== ' ' && file.index !== '?').length,
    isClean: status.isClean()
  }
}

async function repositorySummary(path: string): Promise<RepositorySummary> {
  const git = await assertRepository(path)
  return summaryFromStatus(path, await git.status())
}

async function repositoryDetails(path: string): Promise<RepositoryDetails> {
  const git = await assertRepository(path)
  const status = await git.status()
  const files: ChangedFile[] = status.files.map((file) => ({
    path: file.path,
    index: file.index,
    workingDir: file.working_dir,
    staged: file.index !== ' ' && file.index !== '?',
    status: file.working_dir !== ' ' ? file.working_dir : file.index
  }))
  return { summary: summaryFromStatus(path, status), files }
}

async function repositoryLog(path: string): Promise<CommitSummary[]> {
  const git = await assertRepository(path)
  const log = await git.log({ maxCount: 30 }).catch((error: Error) => {
    if (error.message.includes('does not have any commits yet')) return { all: [] }
    throw error
  })
  return log.all.map((commit) => ({
    hash: commit.hash,
    date: commit.date,
    message: commit.message,
    author: commit.author_name
  }))
}

function encryptedTokenPath(): string {
  return join(app.getPath('userData'), 'github-token.bin')
}

function githubClientIdPath(): string {
  return join(app.getPath('userData'), 'github-client-id.txt')
}

async function saveGitHubToken(token: string): Promise<void> {
  if (!token.trim()) throw new Error(t("Der Token darf nicht leer sein."))
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(t("Sichere Speicherung ist auf diesem System nicht verfügbar."))
  }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(encryptedTokenPath(), safeStorage.encryptString(token.trim()))
}

async function loadGitHubToken(): Promise<string> {
  const tokenPath = encryptedTokenPath()
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(t("Sichere Speicherung ist auf diesem System nicht verfügbar."))
    }
    return safeStorage.decryptString(await fs.readFile(tokenPath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(t("Bitte hinterlege zuerst einen GitHub Personal Access Token."))
    }
    throw error
  }
}

function parseGitHubRemote(remote: string): { owner: string; repository: string } {
  const value = remote.trim()
  let path: string
  const scp = value.match(/^git@github\.com:([^?#]+)$/i)
  if (scp) {
    path = scp[1]
  } else {
    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      throw new Error(t("Das origin-Remote ist kein unterstütztes GitHub-Repository."))
    }
    if (!['https:', 'ssh:'].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== 'github.com') {
      throw new Error(t("Das origin-Remote ist kein unterstütztes GitHub-Repository."))
    }
    path = parsed.pathname.replace(/^\/+/, '')
  }
  const segments = path.replace(/\.git$/i, '').split('/')
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new Error(t("Das origin-Remote ist kein unterstütztes GitHub-Repository."))
  }
  return { owner: segments[0], repository: segments[1] }
}

async function githubRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {})
    }
  })
  const data = (await response.json()) as { message?: string }
  if (!response.ok) throw new Error(data.message || t("GitHub-Anfrage fehlgeschlagen ({0}).", response.status))
  return data as T
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:save', async (_event, value: unknown) => {
    const settings = validateSettings(value)
    if (settings.defaultWorkspace) await readWorkspace(settings.defaultWorkspace)
    const directory = app.getPath('userData')
    await fs.mkdir(directory, { recursive: true })
    const temporary = join(directory, `settings-${randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8')
      await fs.rename(temporary, join(directory, 'settings.json'))
      language = settings.language
    } finally {
      await fs.rm(temporary, { force: true })
    }
    return settings
  })
  ipcMain.handle('settings:choose-workspace', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: t("Standard-Workspace auswählen"),
      properties: ['openFile'],
      filters: [{ name: t("VCC Workspace"), extensions: ['vcc-workspace.json', 'json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    await readWorkspace(path)
    return path
  })
  ipcMain.handle('workspace:open-default', async () => {
    const settings = await readSettings()
    if (!settings.defaultWorkspace) return null
    return activateWorkspace(settings.defaultWorkspace)
  })

  ipcMain.handle('workspace:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: t("Workspace öffnen"),
      properties: ['openFile'],
      filters: [{ name: t("VCC Workspace"), extensions: ['vcc-workspace.json', 'json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return activateWorkspace(result.filePaths[0])
  })

  ipcMain.handle('workspace:recent-list', () => loadRecentWorkspaces())

  ipcMain.handle('workspace:recent-open', async (_event, path: string) => {
    if (typeof path !== 'string' || !path.trim()) throw new Error(t("Workspace-Pfad ist ungültig."))
    const recent = await loadRecentWorkspaces()
    const selected = resolve(path)
    if (!recent.some((item) => item.path.toLocaleLowerCase('en-US') === selected.toLocaleLowerCase('en-US'))) {
      throw new Error(t("Dieser Workspace steht nicht in der Liste der zuletzt geöffneten Workspaces."))
    }
    return activateWorkspace(selected)
  })

  ipcMain.handle('workspace:create', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: t("Workspace erstellen"),
      defaultPath: t("Mein Workspace.vcc-workspace.json"),
      filters: [{ name: t("VCC Workspace"), extensions: ['vcc-workspace.json'] }]
    })
    if (result.canceled || !result.filePath) return null
    const newWorkspacePath = result.filePath.endsWith('.vcc-workspace.json')
      ? result.filePath
      : `${result.filePath}.vcc-workspace.json`
    const workspace: Workspace = { name: workspaceNameFromPath(newWorkspacePath), repositories: [] }
    await fs.writeFile(newWorkspacePath, JSON.stringify(workspace, null, 2), 'utf8')
    await rememberWorkspace(newWorkspacePath, workspace)
    workspacePath = newWorkspacePath
    workspaceRepositories = new Map()
    return { path: workspacePath, workspace }
  })

  ipcMain.handle('workspace:save', (_event, repositories: string[]) => saveWorkspace(repositories))
  ipcMain.handle('workspace:update', (_event, value: unknown) => {
    if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string' ||
      !('repositories' in value) || !Array.isArray(value.repositories)) {
      throw new Error(t('Die Workspace-Datei hat ein ungültiges Format.'))
    }
    return saveWorkspace(value.repositories, value.name)
  })

  ipcMain.handle('repositories:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: t("Git-Repositories hinzufügen"),
      properties: ['openDirectory', 'multiSelections']
    })
    if (result.canceled) return null
    const valid: string[] = []
    for (const path of result.filePaths) {
      if (await gitAt(path).checkIsRepo()) {
        valid.push((await gitAt(path).revparse(['--show-toplevel'])).trim())
      }
    }
    return valid
  })

  ipcMain.handle('repositories:scan', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: t("Ordner nach Git-Repositories durchsuchen"),
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return findRepositories(result.filePaths[0])
  })

  ipcMain.handle('git:list', async (_event, paths: string[]) =>
    Promise.all(paths.map((path) => repositorySummary(path)))
  )
  ipcMain.handle('git:details', (_event, path: string) => repositoryDetails(path))
  ipcMain.handle('git:log', (_event, path: string) => repositoryLog(path))
  ipcMain.handle('git:commit-files', async (_event, path: string, hash: string) =>
    getCommitFiles(await assertRepository(path), hash, language))
  ipcMain.handle('git:commit-file-diff', async (_event, path: string, hash: string, file: string) =>
    getCommitFileDiff(await assertRepository(path), hash, file, language))
  ipcMain.handle('git:unpushed', async (_event, path: string) => {
    const git = await assertRepository(path)
    const status = await git.status()
    if (status.detached) return { upstream: null, comparison: 'detached', commits: [] }
    let range: string[]
    if (status.tracking) {
      const upstream = (await git.raw(['rev-parse', '--verify', '@{upstream}'])).trim()
      range = [`${upstream}..HEAD`]
    } else {
      const hasHead = await git.raw(['rev-parse', '--verify', 'HEAD']).then(
        () => true,
        (error: Error) => {
          if (error.message.includes('Needed a single revision')) return false
          throw error
        }
      )
      if (!hasHead) return { upstream: null, comparison: 'remotes', commits: [] }
      range = ['HEAD', '--not', '--remotes']
    }
    const log = await git.log(range)
    return {
      upstream: status.tracking,
      comparison: status.tracking ? 'upstream' : 'remotes',
      commits: log.all.map((commit) => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name
      }))
    }
  })
  ipcMain.handle('git:diff', async (_event, path: string, file: string) => {
    const git = await assertRepository(path)
    const root = resolve(path)
    const [safeFile] = safeFilePaths(root, [file])
    const changedFile = (await git.status(['--', safeFile])).files.find((entry) => entry.path === safeFile)
    if (changedFile && (changedFile.index === '?' || changedFile.working_dir === '?')) {
      return untrackedFilePatch(root, safeFile)
    }
    const stagedOnly = changedFile && changedFile.working_dir === ' ' && changedFile.index !== ' '
    return git.diff([...(stagedOnly ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--unified=3', '--', safeFile])
  })
  ipcMain.handle('git:stage', async (_event, path: string, files: string[]) => {
    const git = await assertRepository(path)
    const root = (await git.revparse(['--show-toplevel'])).trim()
    await git.add(safeFilePaths(root, files))
  })
  ipcMain.handle('git:stage-hunks', async (_event, path: string, file: string, indexes: number[]) => {
    if (!Array.isArray(indexes) || indexes.some((index) => !Number.isInteger(index) || index < 0)) {
      throw new Error(t("Die Auswahl der Änderungsblöcke ist ungültig."))
    }
    const git = await assertRepository(path)
    const root = (await git.revparse(['--show-toplevel'])).trim()
    const [safeFile] = safeFilePaths(root, [file])
    const changedFile = (await git.status()).files.find((entry) => entry.path === safeFile)
    const patch = changedFile && (changedFile.index === '?' || changedFile.working_dir === '?')
      ? await untrackedFilePatch(root, safeFile)
      : await git.diff(['--no-ext-diff', '--no-textconv', '--no-color', '--unified=3', '--', safeFile])
    const lines = patch.split('\n')
    const firstHunk = lines.findIndex((line) => line.startsWith('@@ '))
    if (firstHunk < 0) throw new Error(t("Für diese Datei wurden keine Änderungsblöcke gefunden."))
    const header = lines.slice(0, firstHunk)
    const hunks: string[][] = []
    for (const line of lines.slice(firstHunk)) {
      if (line.startsWith('@@ ')) hunks.push([line])
      else if (hunks.length) hunks[hunks.length - 1].push(line)
    }
    const selected = [...new Set(indexes)].map((index) => hunks[index])
    if (!selected.length || selected.some((hunk) => !hunk)) {
      throw new Error(t("Mindestens ein gültiger Änderungsblock muss ausgewählt werden."))
    }
    const temporaryPatch = join(tmpdir(), `vcc-${randomUUID()}.patch`)
    try {
      await fs.writeFile(temporaryPatch, `${[...header, ...selected.flat()].join('\n')}\n`, 'utf8')
      await git.raw(['apply', '--cached', '--recount', temporaryPatch])
    } finally {
      await fs.rm(temporaryPatch, { force: true })
    }
  })
  ipcMain.handle('git:unstage', async (_event, path: string, files: string[]) => {
    const git = await assertRepository(path)
    const root = (await git.revparse(['--show-toplevel'])).trim()
    const safeFiles = safeFilePaths(root, files)
    const hasHead = await git.raw(['rev-parse', '--verify', 'HEAD']).then(
      () => true,
      (error: Error) => {
        if (error.message.includes('Needed a single revision')) return false
        throw error
      }
    )
    if (hasHead) await git.raw(['reset', 'HEAD', '--', ...safeFiles])
    else await git.raw(['rm', '--cached', '--', ...safeFiles])
  })
  ipcMain.handle('git:discard-file', async (_event, path: string, file: string): Promise<boolean> => {
    const git = await assertRepository(path)
    const root = (await git.revparse(['--show-toplevel'])).trim()
    const [safeFile] = safeFilePaths(root, [file])
    const isDirectory = await fs.lstat(resolve(root, safeFile)).then(
      (info) => info.isDirectory(),
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false
        throw error
      }
    )
    if (isDirectory) throw new Error(t('Nur einzelne Dateien können verworfen werden, keine Verzeichnisse.'))
    const status = await git.status()
    const changed = status.files.find((entry) => entry.path.replace(/\/$/, '') === safeFile)
    if (!changed) throw new Error(t('Die Datei hat keine lokalen Änderungen mehr.'))
    const rename = status.renamed.find((entry) => entry.to === safeFile)
    const paths = safeFilePaths(root, rename ? [rename.from, safeFile] : [safeFile])
    for (const entry of paths) {
      const indexed = await git.raw(['ls-files', '--stage', '--', `:(literal)${entry}`])
      if (indexed.startsWith('160000 ')) throw new Error(t('Änderungen an Submodulen müssen im jeweiligen Repository verworfen werden.'))
    }
    const answer = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: t('Änderungen verwerfen'),
      message: t('Änderungen an „{0}“ verwerfen?', safeFile),
      detail: t('Alle lokalen und vorgemerkten Änderungen dieser Datei werden auf den letzten Commit zurückgesetzt. Neue Dateien werden in den Papierkorb verschoben. Dies kann nicht über die Anwendung rückgängig gemacht werden.'),
      buttons: [t('Abbrechen'), t('Änderungen verwerfen')],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (answer.response !== 1) return false
    const hasHead = await git.raw(['rev-parse', '--verify', 'HEAD']).then(
      () => true,
      (error: Error) => {
        if (error.message.includes('Needed a single revision')) return false
        throw error
      }
    )
    const literalPaths = paths.map((entry) => `:(literal)${entry}`)
    const inHead = hasHead && (await git.raw(['ls-tree', '-z', 'HEAD', '--', `:(literal)${safeFile}`])).length > 0
    if (inHead || rename) {
      await git.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...literalPaths])
    } else {
      const absoluteFile = resolve(root, safeFile)
      const info = await fs.lstat(absoluteFile).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (info) {
        safeFilePaths(await fs.realpath(root), [join(await fs.realpath(dirname(absoluteFile)), basename(absoluteFile))])
        if (info.isDirectory()) throw new Error(t('Nur einzelne Dateien können verworfen werden, keine Verzeichnisse.'))
        await shell.trashItem(absoluteFile)
      }
      if (changed.index !== '?') await git.raw(['rm', '--cached', '--force', '--', `:(literal)${safeFile}`])
    }
    return true
  })
  ipcMain.handle('git:commit', async (_event, path: string, message: string) => {
    if (!message.trim()) throw new Error(t("Bitte gib eine Commit-Nachricht ein."))
    await (await assertRepository(path)).commit(message.trim())
  })
  ipcMain.handle('git:sync', async (_event, path: string, action: 'fetch' | 'pull' | 'push') => {
    if (!['fetch', 'pull', 'push'].includes(action)) throw new Error(t("Unbekannte Git-Aktion."))
    await syncRepository(path, action)
    return t("{0} abgeschlossen.", action)
  })
  ipcMain.handle('git:sync-all', async (_event, paths: string[], action: 'fetch' | 'pull' | 'push') => {
    if (!['fetch', 'pull', 'push'].includes(action)) throw new Error(t("Unbekannte Git-Aktion."))
    return Promise.all(paths.map(async (path) => {
      await syncRepository(path, action)
      return path
    }))
  })
  ipcMain.handle('git:create-branch', async (_event, path: string, branchName: string, fromBranch: string) => {
    if (!branchName.trim()) throw new Error(t("Bitte gib einen Branch-Namen ein."))
    const git = await assertRepository(path)
    const status = await git.status()
    const shouldStash = !status.isClean()
    const originalBranch = (await git.branch()).current
    if (shouldStash) await git.stash(['push', '--include-untracked', '-m', t("Version Control Center: automatischer Branch-Wechsel")])
    try {
      await git.checkout(fromBranch)
      await git.checkoutLocalBranch(branchName.trim())
    } catch (error) {
      let rollbackMessage = ''
      if (originalBranch) {
        try {
          await git.checkout(originalBranch)
        } catch (rollbackError) {
          rollbackMessage = t(" Der vorherige Branch konnte nicht wiederhergestellt werden: {0}.", rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
        }
      }
      if (shouldStash) {
        try {
          await git.stash(['pop'])
        } catch (restoreError) {
          const original = error instanceof Error ? error.message : String(error)
          const restore = restoreError instanceof Error ? restoreError.message : String(restoreError)
          throw new Error(t("Branch-Wechsel fehlgeschlagen ({0}); Änderungen konnten nicht wiederhergestellt werden ({1}).{2}", original, restore, rollbackMessage))
        }
      }
      if (rollbackMessage) throw new Error(`${error instanceof Error ? error.message : String(error)}.${rollbackMessage}`)
      throw error
    }
    if (shouldStash) {
      try {
        await git.stash(['pop'])
        return t("Branch erstellt und gewechselt. Deine Änderungen wurden wiederhergestellt.")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return t("Branch erstellt und gewechselt, aber die Änderungen konnten nicht wiederhergestellt werden. Bitte prüfe deinen Stash. Git meldet: {0}", message)
      }
    }
    return t('Branch erstellt und gewechselt.')
  })
  ipcMain.handle('github:save-token', async (_event, token: string) => {
    await saveGitHubToken(token)
  })
  ipcMain.handle('github:get-client-id', async () => {
    try {
      return await fs.readFile(githubClientIdPath(), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    }
  })
  ipcMain.handle('github:start-device-flow', async (_event, clientId: string): Promise<DeviceFlowInfo> => {
    const value = clientId.trim()
    if (!/^[A-Za-z0-9]+$/.test(value)) throw new Error(t("Die GitHub OAuth Client ID ist ungültig."))
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: value, scope: 'repo' })
    })
    const data = (await response.json()) as {
      device_code?: string
      user_code?: string
      verification_uri?: string
      expires_in?: number
      interval?: number
      error?: string
      error_description?: string
    }
    if (!response.ok || data.error || !data.device_code || !data.user_code || !data.verification_uri) {
      throw new Error(data.error_description || data.error || t("GitHub-Anmeldung konnte nicht gestartet werden ({0}).", response.status))
    }
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(githubClientIdPath(), value, 'utf8')
    pendingDeviceFlow = {
      clientId: value,
      deviceCode: data.device_code,
      expiresAt: Date.now() + (data.expires_in ?? 900) * 1000,
      interval: data.interval ?? 5
    }
    const verificationUrl = new URL(data.verification_uri)
    if (verificationUrl.protocol !== 'https:' || verificationUrl.hostname !== 'github.com') {
      pendingDeviceFlow = undefined
      throw new Error(t("GitHub hat eine ungültige Bestätigungsadresse zurückgegeben."))
    }
    await shell.openExternal(verificationUrl.toString())
    return {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in ?? 900,
      interval: data.interval ?? 5
    }
  })
  ipcMain.handle('github:poll-device-flow', async (): Promise<DeviceFlowPollResult> => {
    const flow = pendingDeviceFlow
    if (!flow) throw new Error(t("Es läuft keine GitHub-Browser-Anmeldung."))
    if (Date.now() >= flow.expiresAt) {
      pendingDeviceFlow = undefined
      throw new Error(t("Der GitHub-Bestätigungscode ist abgelaufen. Bitte starte die Anmeldung erneut."))
    }
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: flow.clientId,
        device_code: flow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const data = (await response.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }
    if (data.access_token) {
      await saveGitHubToken(data.access_token)
      pendingDeviceFlow = undefined
      return { status: 'complete' }
    }
    if (data.error === 'authorization_pending') return { status: 'pending', interval: flow.interval }
    if (data.error === 'slow_down') {
      flow.interval += 5
      return { status: 'pending', interval: flow.interval }
    }
    pendingDeviceFlow = undefined
    throw new Error(data.error_description || data.error || t("GitHub-Anmeldung fehlgeschlagen ({0}).", response.status))
  })
  ipcMain.handle('github:cancel-device-flow', () => {
    pendingDeviceFlow = undefined
  })
  ipcMain.handle('github:has-token', async () => {
    try {
      await fs.access(encryptedTokenPath())
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  })
  ipcMain.handle('repository:open-remote', async (_event, path: string) => {
    const git = await assertRepository(path)
    const origin = (await git.getRemotes(true)).find((remote) => remote.name === 'origin')
    if (!origin) throw new Error(t("Für dieses Repository ist kein origin-Remote konfiguriert."))
    const { owner, repository } = parseGitHubRemote(origin.refs.fetch)
    await shell.openExternal(`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`)
  })
  ipcMain.handle('repository:open-explorer', async (_event, path: string) => {
    const git = await assertRepository(path)
    const root = (await git.revparse(['--show-toplevel'])).trim()
    const error = await shell.openPath(root)
    if (error) throw new Error(t("Der Repository-Ordner konnte nicht geöffnet werden: {0}", error))
  })
  ipcMain.handle('repository:open-bash', async (_event, path: string) => {
    if (process.platform !== 'win32') throw new Error(t("Git Bash kann nur unter Windows gestartet werden."))
    const git = await assertRepository(path)
    const root = (await git.revparse(['--show-toplevel'])).trim()
    const gitExecPath = (await git.raw(['--exec-path'])).trim()
    const bashPath = resolve(gitExecPath, '..', '..', '..', 'git-bash.exe')
    try {
      await fs.access(bashPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      throw new Error(t("Git Bash wurde nicht neben der installierten Git-Version gefunden. Installiere Git for Windows."))
    }
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(bashPath, [`--cd=${root}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolvePromise()
      })
    })
  })
  ipcMain.handle('github:create-pr', async (_event, path: string, title: string, body: string) => {
    if (!title.trim()) throw new Error(t("Bitte gib einen Titel für den Pull Request ein."))
    const git = await assertRepository(path)
    const [token, remotes, branch] = await Promise.all([
      loadGitHubToken(),
      git.getRemotes(true),
      git.branch()
    ])
    const origin = remotes.find((remote) => remote.name === 'origin')
    if (!origin) throw new Error(t("Für dieses Repository ist kein origin-Remote konfiguriert."))
    if (!branch.current) throw new Error(t("Pull Requests können nicht aus einem Detached-HEAD erstellt werden."))
    const remoteBranch = await git.raw(['ls-remote', '--heads', 'origin', branch.current])
    if (!remoteBranch.trim()) {
      throw new Error(t("Der Branch wurde noch nicht zu GitHub gepusht. Bitte pushe ihn zuerst manuell."))
    }
    const { owner, repository } = parseGitHubRemote(origin.refs.fetch)
    const repo = await githubRequest<{ default_branch: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
      token
    )
    const result = await githubRequest<PullRequestResult>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body,
          head: branch.current,
          base: repo.default_branch
        })
      }
    )
    return result.html_url
  })
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      throw new Error(t("Es können nur Pull-Request-Links auf github.com geöffnet werden."))
    }
    await shell.openExternal(parsed.toString())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
