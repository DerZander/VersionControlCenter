const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const { simpleGit } = require('simple-git')

async function createApplication(t, withCommit = true, fetchImages = fetch) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vcc-loading-test-'))
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const repository = path.join(temporary, 'repository')
  const userData = path.join(temporary, 'user-data')
  await fs.mkdir(repository)
  await fs.mkdir(userData)
  const git = simpleGit(repository)
  await git.init()
  await git.addConfig('core.autocrlf', 'false')
  await git.addConfig('user.name', 'VCC Test')
  await git.addConfig('user.email', 'vcc@example.invalid')
  if (withCommit) {
    await fs.writeFile(path.join(repository, 'tracked.txt'), 'before\n')
    await git.add(['tracked.txt'])
    await git.commit('initial')
    await fs.writeFile(path.join(repository, 'tracked.txt'), 'after\n')
  }
  const workspaceFile = path.join(temporary, 'test.vcc-workspace.json')
  await fs.writeFile(workspaceFile, JSON.stringify({ name: 'Test', repositories: [repository] }))

  const handlers = new Map()
  const calls = []
  const menus = []
  const dialogs = []
  const externalUrls = []
  const confirmations = []
  const trashed = []
  const confirmation = { response: 0 }
  const electron = {
    net: { fetch: fetchImages },
    shell: {
      openExternal: async (url) => { externalUrls.push(url) },
      trashItem: async (file) => {
        trashed.push(file)
        await fs.rename(file, path.join(temporary, `trash-${trashed.length}`))
      }
    },
    Menu: { setApplicationMenu: (menu) => menus.push(menu) },
    app: {
      whenReady: () => Promise.resolve(),
      getPath: () => userData,
      on: () => {},
      quit: () => {}
    },
    BrowserWindow: class {
      loadFile() { return Promise.resolve() }
      loadURL() { return Promise.resolve() }
    },
    dialog: { showMessageBox: async (_window, options) => {
      confirmations.push(options)
      return confirmation
    }, showOpenDialog: async (_window, options) => {
      dialogs.push(options)
      return { canceled: false, filePaths: [workspaceFile] }
    } },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }
  }
  const mainFile = path.resolve('out', 'main', 'index.js')
  const localRequire = createRequire(mainFile)
  const source = await fs.readFile(mainFile, 'utf8')
  const customRequire = (id) => {
    if (id === 'electron') return electron
    if (id === 'simple-git') {
      return {
        simpleGit: (options) => {
          const instance = simpleGit(options)
          return new Proxy(instance, {
            get(target, property) {
              const value = target[property]
              if (typeof value !== 'function') return value
              return (...args) => {
                calls.push({ method: property, args })
                return value.apply(target, args)
              }
            }
          })
        }
      }
    }
    return localRequire(id)
  }
  const context = vm.createContext({
    require: customRequire, __filename: mainFile, __dirname: path.dirname(mainFile),
    process, console, URL, fetch: fetchImages, Buffer, TextDecoder, AbortSignal, setTimeout, clearTimeout
  })
  vm.runInContext(source, context, { filename: mainFile })
  await Promise.resolve()
  const invoke = (channel, ...args) => {
    assert.ok(handlers.has(channel), `Missing IPC handler: ${channel}`)
    return handlers.get(channel)({}, ...args)
  }
  await invoke('workspace:open')
  calls.length = 0
  return { repository, git, calls, invoke, userData, workspaceFile, menus, dialogs, externalUrls, confirmation, confirmations, trashed }
}

test('discard asks for confirmation and cancel leaves worktree and index untouched', async (t) => {
  const app = await createApplication(t)
  await app.git.add(['tracked.txt'])
  await fs.writeFile(path.join(app.repository, 'tracked.txt'), 'unstaged\n')
  assert.equal(await app.invoke('git:discard-file', app.repository, 'tracked.txt'), false)
  assert.equal(await fs.readFile(path.join(app.repository, 'tracked.txt'), 'utf8'), 'unstaged\n')
  assert.equal(await app.git.show([':tracked.txt']), 'after\n')
  assert.equal(app.confirmations[0].defaultId, 0)
  assert.equal(app.confirmations[0].cancelId, 0)
})

test('discard restores staged and unstaged edits and deleted files without changing other files or HEAD', async (t) => {
  const app = await createApplication(t)
  app.confirmation.response = 1
  const head = await app.git.revparse(['HEAD'])
  await fs.writeFile(path.join(app.repository, 'other.txt'), 'keep\n')
  await app.git.add(['tracked.txt', 'other.txt'])
  await fs.writeFile(path.join(app.repository, 'tracked.txt'), 'unstaged\n')
  assert.equal(await app.invoke('git:discard-file', app.repository, 'tracked.txt'), true)
  assert.equal(await fs.readFile(path.join(app.repository, 'tracked.txt'), 'utf8'), 'before\n')
  assert.equal(await app.git.show([':tracked.txt']), 'before\n')
  await fs.unlink(path.join(app.repository, 'tracked.txt'))
  await app.invoke('git:discard-file', app.repository, 'tracked.txt')
  assert.equal(await fs.readFile(path.join(app.repository, 'tracked.txt'), 'utf8'), 'before\n')
  assert.equal(await app.git.show([':other.txt']), 'keep\n')
  assert.equal(await app.git.revparse(['HEAD']), head)
})

test('discard trashes only the selected new file, including staged additions and unborn repositories', async (t) => {
  for (const withCommit of [true, false]) {
    const app = await createApplication(t, withCommit)
    app.confirmation.response = 1
    for (const staged of [false, true]) {
      const name = staged ? 'new-staged.txt' : 'new.txt'
      await fs.writeFile(path.join(app.repository, name), 'new content\n')
      if (staged) await app.git.add([name])
      assert.equal(await app.invoke('git:discard-file', app.repository, name), true)
      await assert.rejects(fs.stat(path.join(app.repository, name)), { code: 'ENOENT' })
      assert.equal((await app.git.status()).files.some(file => file.path === name), false)
      assert.equal(app.trashed.at(-1), path.join(app.repository, name))
    }
  }
})

test('discard restores a staged rename and handles staged additions deleted from disk', async (t) => {
  const app = await createApplication(t)
  app.confirmation.response = 1
  await app.git.mv('tracked.txt', 'renamed.txt')
  await app.invoke('git:discard-file', app.repository, 'renamed.txt')
  assert.equal(await fs.readFile(path.join(app.repository, 'tracked.txt'), 'utf8'), 'before\n')
  await assert.rejects(fs.stat(path.join(app.repository, 'renamed.txt')), { code: 'ENOENT' })
  await fs.writeFile(path.join(app.repository, 'added.txt'), 'new\n')
  await app.git.add(['added.txt'])
  await fs.unlink(path.join(app.repository, 'added.txt'))
  await app.invoke('git:discard-file', app.repository, 'added.txt')
  assert.equal((await app.git.status()).isClean(), true)
})

test('discard rejects paths outside workspace, unchanged files and entire untracked directories', async (t) => {
  const app = await createApplication(t)
  app.confirmation.response = 1
  await assert.rejects(app.invoke('git:discard-file', path.dirname(app.repository), 'tracked.txt'), /does not belong/)
  await assert.rejects(app.invoke('git:discard-file', app.repository, '..\\outside.txt'), /outside the repository/)
  await fs.mkdir(path.join(app.repository, 'folder'))
  await fs.writeFile(path.join(app.repository, 'folder', 'keep.txt'), 'keep\n')
  await assert.rejects(app.invoke('git:discard-file', app.repository, 'folder/'), /not directories/)
  assert.equal(await fs.readFile(path.join(app.repository, 'folder', 'keep.txt'), 'utf8'), 'keep\n')
  await app.invoke('git:discard-file', app.repository, 'tracked.txt')
  await assert.rejects(app.invoke('git:discard-file', app.repository, 'tracked.txt'), /no longer has local changes/)
})

test('GitHub remote button opens HTTPS and SSH origins without login or network requests', async (t) => {
  const app = await createApplication(t, true, async () => assert.fail('No API request expected'))
  const remotes = [
    'https://github.com/example/repository.git',
    'git@github.com:example/repository.git',
    'ssh://git@github.com/example/repository.git',
    'https://username:password@github.com/example/repository.git'
  ]
  await app.git.addRemote('origin', remotes[0])
  for (const remote of remotes) {
    await app.git.remote(['set-url', 'origin', remote])
    await app.invoke('repository:open-remote', app.repository)
  }
  assert.deepEqual(app.externalUrls, remotes.map(() => 'https://github.com/example/repository'))
})

test('GitHub remote button rejects missing, foreign and unsupported origins', async (t) => {
  const app = await createApplication(t)
  await assert.rejects(app.invoke('repository:open-remote', path.dirname(app.repository)), /does not belong/)
  await assert.rejects(app.invoke('repository:open-remote', app.repository), /No origin remote/)
  await app.git.addRemote('origin', 'https://gitlab.com/example/repository.git')
  for (const remote of [
    'https://gitlab.com/example/repository.git', 'https://github.com.evil.invalid/example/repository.git',
    'file:///tmp/repository', 'https://github.com/example', 'https://github.com/example/repository/extra'
  ]) {
    await app.git.remote(['set-url', 'origin', remote])
    await assert.rejects(app.invoke('repository:open-remote', app.repository), /not a supported GitHub/)
  }
  assert.deepEqual(app.externalUrls, [])
})

test('native application menu is removed when creating the window', async (t) => {
  const app = await createApplication(t)
  assert.deepEqual(app.menus, [null])
})

test('workspace switcher keeps all known workspaces rather than truncating to eight', async (t) => {
  const app = await createApplication(t)
  const entries = []
  for (let index = 0; index < 12; index++) {
    const file = path.join(path.dirname(app.repository), `workspace-${index}.json`)
    await fs.writeFile(file, JSON.stringify({ name: `Workspace ${index}`, repositories: [] }))
    entries.push({ path: file, name: `Workspace ${index}`, lastOpenedAt: new Date().toISOString() })
  }
  await fs.writeFile(path.join(app.userData, 'recent-workspaces.json'), JSON.stringify(entries))
  assert.equal((await app.invoke('workspace:recent-list')).length, 12)
  await app.invoke('workspace:recent-open', entries[11].path)
  const recent = await app.invoke('workspace:recent-list')
  assert.equal(recent.length, 12)
  assert.equal(recent[0].path, entries[11].path)
  await app.invoke('workspace:open')
  assert.equal((await app.invoke('workspace:recent-list')).length, 13)
})

async function addRemote(app, name) {
  const remote = path.join(path.dirname(app.repository), `${name}.git`)
  await fs.mkdir(remote)
  await simpleGit(remote).init(true)
  await app.git.addRemote(name, remote)
  return remote
}

test('commit inspector shows initial, modified, deleted, renamed and binary files without changing worktree or index', async (t) => {
  const app = await createApplication(t)
  const initial = (await app.git.revparse(['HEAD'])).trim()
  const rootFiles = await app.invoke('git:commit-files', app.repository, initial)
  assert.deepEqual(Array.from(rootFiles, file => [file.path, file.status]), [['tracked.txt', 'A']])
  assert.match(await app.invoke('git:commit-file-diff', app.repository, initial, 'tracked.txt'), /\+before/)
  await fs.writeFile(path.join(app.repository, 'rename old.txt'), 'rename content\n'.repeat(10))
  await fs.writeFile(path.join(app.repository, 'delete.txt'), 'delete content\n')
  await app.git.add(['rename old.txt', 'delete.txt'])
  await app.git.commit('prepare')
  await app.git.mv('rename old.txt', 'rename new.txt')
  await fs.unlink(path.join(app.repository, 'delete.txt'))
  await fs.writeFile(path.join(app.repository, 'binary.dat'), Buffer.from([0, 1, 2, 3]))
  await fs.writeFile(path.join(app.repository, '[literal].txt'), 'literal content\n')
  await app.git.add(['--all'])
  await app.git.commit('file changes')
  const hash = (await app.git.revparse(['HEAD'])).trim()
  await fs.writeFile(path.join(app.repository, 'tracked.txt'), 'staged\n')
  await app.git.add(['tracked.txt'])
  await fs.writeFile(path.join(app.repository, 'tracked.txt'), 'unstaged\n')
  const files = await app.invoke('git:commit-files', app.repository, hash)
  const renamed = files.find(file => file.path === 'rename new.txt')
  assert.equal(renamed.previousPath, 'rename old.txt')
  assert.equal(renamed.status, 'R')
  assert.equal(files.find(file => file.path === 'delete.txt').status, 'D')
  const renamedPatch = await app.invoke('git:commit-file-diff', app.repository, hash, 'rename new.txt')
  assert.match(renamedPatch, /rename from rename old.txt/)
  assert.match(renamedPatch, /rename to rename new.txt/)
  assert.match(await app.invoke('git:commit-file-diff', app.repository, hash, 'delete.txt'), /-delete content/)
  assert.match(await app.invoke('git:commit-file-diff', app.repository, hash, 'tracked.txt'), /-before[\s\S]*\+after/)
  assert.match(await app.invoke('git:commit-file-diff', app.repository, hash, 'binary.dat'), /Binary files/)
  assert.match(await app.invoke('git:commit-file-diff', app.repository, hash, '[literal].txt'), /\+literal content/)
  assert.equal(await fs.readFile(path.join(app.repository, 'tracked.txt'), 'utf8'), 'unstaged\n')
  assert.equal(await app.git.show([':tracked.txt']), 'staged\n')
  assert.equal((await app.git.revparse(['HEAD'])).trim(), hash)
})

test('commit inspector compares merges to first parent and supports empty commits', async (t) => {
  const app = await createApplication(t)
  const branch = (await app.git.branch()).current
  await app.git.checkoutLocalBranch('side')
  await fs.writeFile(path.join(app.repository, 'side.txt'), 'side\n')
  await app.git.add(['side.txt'])
  await app.git.commit('side')
  await app.git.checkout(branch)
  await app.git.raw(['merge', '--no-ff', 'side', '-m', 'merge'])
  const hash = (await app.git.revparse(['HEAD'])).trim()
  const files = await app.invoke('git:commit-files', app.repository, hash)
  assert.deepEqual(Array.from(files, file => file.path), ['side.txt'])
  assert.match(await app.invoke('git:commit-file-diff', app.repository, hash, 'side.txt'), /\+side/)
  await app.git.raw(['commit', '--allow-empty', '-m', 'empty'])
  assert.equal((await app.invoke('git:commit-files', app.repository, (await app.git.revparse(['HEAD'])).trim())).length, 0)
})

test('commit inspector rejects invalid commits, foreign repositories and files outside a commit', async (t) => {
  const app = await createApplication(t)
  const hash = (await app.git.revparse(['HEAD'])).trim()
  await assert.rejects(app.invoke('git:commit-files', path.dirname(app.repository), hash), /does not belong/)
  for (const invalid of ['HEAD', '--all', 'abc', 'a'.repeat(40)]) {
    await assert.rejects(app.invoke('git:commit-files', app.repository, invalid))
  }
  await assert.rejects(app.invoke('git:commit-file-diff', app.repository, hash, '..\\outside'), /does not belong to this commit/)
  await assert.rejects(app.invoke('git:commit-file-diff', app.repository, hash, 'not-in-commit.txt'), /does not belong to this commit/)
})

test('unpushed lists every outgoing commit beyond the history limit and clears after push', async (t) => {
  const app = await createApplication(t)
  await addRemote(app, 'origin')
  await app.invoke('git:sync', app.repository, 'push')
  const upstream = (await app.git.status()).tracking
  for (let index = 1; index <= 32; index++) {
    await app.git.raw(['commit', '--allow-empty', '-m', `outgoing ${index}`])
  }
  app.calls.length = 0
  const result = await app.invoke('git:unpushed', app.repository)
  assert.equal(result.upstream, upstream)
  assert.equal(result.commits.length, 32)
  assert.equal(result.commits[0].message, 'outgoing 32')
  assert.equal(result.commits.at(-1).message, 'outgoing 1')
  assert.ok(result.commits.every(commit => /^[a-f0-9]{40}$/.test(commit.hash) && commit.author === 'VCC Test' && !isNaN(Date.parse(commit.date))))
  assert.ok(app.calls.every(call => ['status', 'raw', 'log'].includes(call.method)))
  assert.equal(app.calls.some(call => call.method === 'raw' && call.args[0][0] !== 'rev-parse'), false)
  const summary = (await app.invoke('git:details', app.repository)).summary
  assert.equal(summary.upstream, upstream)
  assert.equal(summary.ahead, 32)
  assert.equal((await app.invoke('git:log', app.repository)).length, 30)
  await app.invoke('git:sync', app.repository, 'push')
  assert.equal((await app.invoke('git:unpushed', app.repository)).commits.length, 0)
  assert.equal(await fs.readFile(path.join(app.repository, 'tracked.txt'), 'utf8'), 'after\n')
})

test('unpushed distinguishes missing upstream, empty repositories and detached HEAD', async (t) => {
  for (const withCommit of [false, true]) {
    const app = await createApplication(t, withCommit)
    const result = await app.invoke('git:unpushed', app.repository)
    assert.equal(result.upstream, null)
    assert.equal(result.comparison, 'remotes')
    assert.equal(result.commits.length, withCommit ? 1 : 0)
    assert.equal((await app.invoke('git:details', app.repository)).summary.upstream, null)
    await assert.rejects(app.invoke('git:unpushed', path.dirname(app.repository)), /does not belong/)
    if (withCommit) {
      await app.git.checkout(['--detach', 'HEAD'])
      const detached = await app.invoke('git:unpushed', app.repository)
      assert.equal(detached.upstream, null)
      assert.equal(detached.comparison, 'detached')
      assert.equal(detached.commits.length, 0)
    }
  }
})

test('unpushed without upstream excludes commits present on any known remote branch', async (t) => {
  const app = await createApplication(t)
  await addRemote(app, 'origin')
  await app.git.raw(['push', 'origin', 'HEAD:refs/heads/published'])
  await app.git.raw(['commit', '--allow-empty', '-m', 'already on another branch'])
  await app.git.raw(['push', 'origin', 'HEAD:refs/heads/other'])
  for (let index = 1; index <= 3; index++) {
    await app.git.raw(['commit', '--allow-empty', '-m', `unpublished ${index}`])
  }
  app.calls.length = 0
  const result = await app.invoke('git:unpushed', app.repository)
  assert.equal(result.upstream, null)
  assert.equal(result.comparison, 'remotes')
  assert.deepEqual(Array.from(result.commits, commit => commit.message), ['unpublished 3', 'unpublished 2', 'unpublished 1'])
  assert.equal(app.calls.some(call => call.method === 'fetch' || call.method === 'push'), false)
  assert.equal((await app.git.status()).tracking, null)
})

test('unpushed excludes upstream-only commits on diverged branches and reports a deleted tracking ref', async (t) => {
  const app = await createApplication(t)
  await addRemote(app, 'origin')
  await app.invoke('git:sync', app.repository, 'push')
  const upstream = (await app.git.status()).tracking
  const base = (await app.git.revparse(['HEAD'])).trim()
  const tree = (await app.git.revparse(['HEAD^{tree}'])).trim()
  const remoteCommit = (await app.git.raw(['commit-tree', tree, '-p', base, '-m', 'remote only'])).trim()
  await app.git.raw(['update-ref', `refs/remotes/${upstream}`, remoteCommit])
  await app.git.raw(['commit', '--allow-empty', '-m', 'local only'])
  const result = await app.invoke('git:unpushed', app.repository)
  assert.deepEqual(Array.from(result.commits, commit => commit.message), ['local only'])
  const summary = (await app.invoke('git:details', app.repository)).summary
  assert.equal(summary.ahead, 1)
  assert.equal(summary.behind, 1)
  await app.git.raw(['update-ref', '-d', `refs/remotes/${upstream}`])
  await assert.rejects(app.invoke('git:unpushed', app.repository))
})

test('editing workspace persists its name and repositories without deleting removed repositories', async (t) => {
  const app = await createApplication(t)
  const saved = await app.invoke('workspace:update', { name: ' Renamed ', repositories: [app.repository] })
  assert.equal(saved.name, 'Renamed')
  assert.equal((await app.invoke('workspace:save', [app.repository])).name, 'Renamed')
  assert.equal((await app.invoke('workspace:recent-list'))[0].name, 'Renamed')
  await assert.rejects(app.invoke('workspace:update', { name: ' ', repositories: [] }), /workspace name/)
  await assert.rejects(app.invoke('workspace:update', { name: 'Invalid', repositories: [path.dirname(app.repository)] }), /Git repository/)
  assert.equal(JSON.parse(await fs.readFile(app.workspaceFile, 'utf8')).name, 'Renamed')
  await app.invoke('workspace:update', { name: 'Empty', repositories: [] })
  assert.equal(JSON.parse(await fs.readFile(app.workspaceFile, 'utf8')).repositories.length, 0)
  await fs.access(path.join(app.repository, '.git'))
  await assert.rejects(app.invoke('git:details', app.repository), /does not belong/)
  await app.invoke('workspace:update', { name: 'Restored', repositories: [app.repository] })
  assert.equal((await app.invoke('git:details', app.repository)).files.length, 1)
})

test('pull sets a missing upstream for an existing remote branch without pushing', async (t) => {
  const app = await createApplication(t)
  await app.git.checkoutLocalBranch('features/prepare-deployment')
  await addRemote(app, 'origin')
  await app.git.raw(['push', 'origin', 'HEAD'])
  app.calls.length = 0
  await app.invoke('git:sync', app.repository, 'pull')
  assert.equal((await app.git.revparse(['--abbrev-ref', '@{upstream}'])).trim(), 'origin/features/prepare-deployment')
  assert.equal(app.calls.some(call => call.method === 'push' || (call.method === 'raw' && call.args[0][0] === 'push')), false)
})

test('workspace push publishes a new branch and sets its upstream', async (t) => {
  const app = await createApplication(t)
  await app.git.checkoutLocalBranch('features/new')
  const remote = await addRemote(app, 'origin')
  await app.invoke('git:sync-all', [app.repository], 'push')
  assert.equal((await app.git.revparse(['--abbrev-ref', '@{upstream}'])).trim(), 'origin/features/new')
  assert.equal((await simpleGit(remote).revparse(['refs/heads/features/new'])).trim(), (await app.git.revparse(['HEAD'])).trim())
})

test('pull on an unpublished branch explains manual push and never publishes', async (t) => {
  const app = await createApplication(t)
  const remote = await addRemote(app, 'origin')
  await assert.rejects(app.invoke('git:sync-all', [app.repository], 'pull'), /Push it manually first/)
  assert.equal((await app.git.raw(['ls-remote', '--heads', remote])).trim(), '')
})

test('ambiguous remotes are rejected instead of choosing arbitrarily', async (t) => {
  const app = await createApplication(t)
  await app.git.checkoutLocalBranch('features/shared')
  await addRemote(app, 'origin')
  await addRemote(app, 'other')
  await assert.rejects(app.invoke('git:sync', app.repository, 'push'), /ambiguous/)
  await app.git.raw(['push', 'origin', 'HEAD'])
  await app.git.raw(['push', 'other', 'HEAD'])
  await assert.rejects(app.invoke('git:sync', app.repository, 'pull'), /ambiguous/)
  await app.git.raw(['branch', '--set-upstream-to=other/features/shared'])
  await app.invoke('git:sync', app.repository, 'pull')
  assert.equal((await app.git.revparse(['--abbrev-ref', '@{upstream}'])).trim(), 'other/features/shared')
})

test('loading files needs one status and does not load the history', async (t) => {
  const app = await createApplication(t)
  const details = await app.invoke('git:details', app.repository)
  assert.equal(details.files.length, 1)
  assert.equal(details.files[0].path, 'tracked.txt')
  assert.equal(app.calls.length, 1)
  assert.equal(app.calls[0].method, 'status')
  assert.equal('log' in details, false)

  const history = await app.invoke('git:log', app.repository)
  assert.equal(history.length, 1)
  assert.equal(history[0].message, 'initial')
})

test('diff loading scans only the selected file and respects staging changes', async (t) => {
  const app = await createApplication(t)
  const patch = await app.invoke('git:diff', app.repository, 'tracked.txt')
  assert.match(patch, /\+after/)
  assert.equal(app.calls.length, 2)
  assert.equal(app.calls[0].method, 'status')
  assert.deepEqual(Array.from(app.calls[0].args[0]), ['--', 'tracked.txt'])
  assert.equal(app.calls[1].method, 'diff')

  await app.git.add(['tracked.txt'])
  app.calls.length = 0
  const stagedPatch = await app.invoke('git:diff', app.repository, 'tracked.txt')
  assert.match(stagedPatch, /\+after/)
  assert.ok(app.calls[1].args[0].includes('--cached'))
  await app.git.raw(['reset', 'HEAD', '--', 'tracked.txt'])
  const details = await app.invoke('git:details', app.repository)
  assert.equal(details.summary.staged, 0)
})

test('untracked files and empty repositories remain supported', async (t) => {
  const app = await createApplication(t, false)
  await fs.writeFile(path.join(app.repository, 'new.txt'), 'new content\n')
  const details = await app.invoke('git:details', app.repository)
  assert.equal(details.files.length, 1)
  assert.equal(details.summary.staged, 0)
  const history = await app.invoke('git:log', app.repository)
  assert.equal(history.length, 0)
  const patch = await app.invoke('git:diff', app.repository, 'new.txt')
  assert.match(patch, /\+new content/)
})

test('fast path still rejects repositories outside the workspace', async (t) => {
  const app = await createApplication(t)
  await assert.rejects(app.invoke('git:details', path.dirname(app.repository)), /workspace/)
  await assert.rejects(app.invoke('git:diff', app.repository, '..\\outside.txt'), /outside/)
})

test('settings defaults and persisted appearance are loaded from user data', async (t) => {
  const app = await createApplication(t)
  const defaults = await app.invoke('settings:get')
  assert.equal(defaults.theme, 'dark')
  assert.equal(defaults.language, 'en')
  assert.equal(defaults.defaultWorkspace, null)
  assert.equal(defaults.uiFontSize, 12)
  assert.equal(defaults.codeFontSize, 12)
  assert.equal(defaults.changesView, 'modules')
  assert.equal(await app.invoke('workspace:open-default'), null)

  const settings = { ...defaults, theme: 'light', uiFontSize: 18, codeFontSize: 24, changesView: 'files' }
  await app.invoke('settings:save', settings)
  const persisted = JSON.parse(await fs.readFile(path.join(app.userData, 'settings.json'), 'utf8'))
  assert.deepEqual(persisted, settings)
  const loaded = await app.invoke('settings:get')
  assert.equal(loaded.theme, 'light')
  assert.equal(loaded.uiFontSize, 18)
  assert.equal(loaded.codeFontSize, 24)
  assert.equal(loaded.changesView, 'files')
  assert.deepEqual((await fs.readdir(app.userData)).filter(name => name.endsWith('.tmp')), [])
})

test('language settings migrate older files and localize native dialogs and application errors', async (t) => {
  const app = await createApplication(t)
  const defaults = await app.invoke('settings:get')
  const { language, changesView, ...legacy } = defaults
  assert.equal(language, 'en')
  assert.equal(changesView, 'modules')
  await fs.writeFile(path.join(app.userData, 'settings.json'), JSON.stringify(legacy))
  assert.equal((await app.invoke('settings:get')).language, 'en')
  assert.equal((await app.invoke('settings:get')).changesView, 'modules')
  await app.invoke('settings:save', { ...defaults, language: 'en' })
  assert.equal((await app.invoke('settings:get')).language, 'en')
  await app.invoke('workspace:open')
  assert.equal(app.dialogs.at(-1).title, 'Open workspace')
  await assert.rejects(app.invoke('git:details', path.dirname(app.repository)), /does not belong/)
  await assert.rejects(app.invoke('settings:save', { ...defaults, language: 'fr' }), /settings are invalid/)
  await assert.rejects(app.invoke('settings:save', { ...defaults, changesView: 'unknown' }), /settings are invalid/)
  await app.invoke('settings:save', { ...defaults, language: 'de' })
  assert.equal((await app.invoke('settings:get')).language, 'de')
  await app.invoke('workspace:open')
  assert.equal(app.dialogs.at(-1).title, 'Workspace öffnen')
})

test('default workspace opens even when it is no longer in the recent list', async (t) => {
  const app = await createApplication(t)
  const settings = await app.invoke('settings:get')
  await app.invoke('settings:save', { ...settings, defaultWorkspace: app.workspaceFile })
  await fs.writeFile(path.join(app.userData, 'recent-workspaces.json'), '[]')
  const opened = await app.invoke('workspace:open-default')
  assert.equal(opened.path, app.workspaceFile)
  assert.equal(opened.workspace.repositories[0], app.repository)
  await app.invoke('git:details', app.repository)

  await fs.rm(app.workspaceFile)
  await assert.rejects(app.invoke('workspace:open-default'), /ENOENT/)
  await app.invoke('settings:save', { ...settings, defaultWorkspace: null })
  assert.equal(await app.invoke('workspace:open-default'), null)
})

test('invalid settings and workspaces are rejected without overwriting saved settings', async (t) => {
  const app = await createApplication(t)
  const settings = await app.invoke('settings:get')
  await app.invoke('settings:save', settings)
  for (const invalid of [
    null,
    { ...settings, theme: 'unknown' },
    { ...settings, uiFontSize: 19 },
    { ...settings, codeFontSize: 9 },
    { ...settings, codeFontSize: 12.5 },
    { ...settings, defaultWorkspace: 'relative.json' },
    { ...settings, defaultWorkspace: path.join(app.userData, 'missing.json') }
  ]) {
    await assert.rejects(app.invoke('settings:save', invalid))
  }
  assert.equal((await app.invoke('settings:get')).defaultWorkspace, null)
  const invalidFile = path.join(app.userData, 'invalid-workspace.json')
  await fs.writeFile(invalidFile, '{}')
  await assert.rejects(app.invoke('settings:save', { ...settings, defaultWorkspace: invalidFile }), /workspace/)
  await fs.writeFile(path.join(app.userData, 'settings.json'), '{')
  await assert.rejects(app.invoke('settings:get'), /JSON/)
})
