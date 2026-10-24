import type { SimpleGit } from 'simple-git'
import type { CommitFile } from '../shared/types'
import { translate, type Language } from '../shared/i18n'

async function commitRange(git: SimpleGit, hash: string, language: Language): Promise<string[]> {
  if (typeof hash !== 'string' || !/^[a-f0-9]{40,64}$/i.test(hash)) {
    throw new Error(translate(language, 'Ungültiger Commit-Hash.'))
  }
  const resolved = (await git.raw(['rev-parse', '--verify', `${hash}^{commit}`])).trim()
  const [, parent] = (await git.raw(['rev-list', '--parents', '-n', '1', resolved])).trim().split(' ')
  return parent ? [parent, resolved] : ['--root', resolved]
}

export async function getCommitFiles(git: SimpleGit, hash: string, language: Language): Promise<CommitFile[]> {
  const range = await commitRange(git, hash, language)
  const output = await git.raw(['diff-tree', '--no-commit-id', '-r', '-M', '--name-status', '-z', ...range, '--'])
  const parts = output.split('\0')
  const files: CommitFile[] = []
  for (let index = 0; index < parts.length && parts[index];) {
    const status = parts[index++]
    const path = parts[index++]
    if (status.startsWith('R') || status.startsWith('C')) {
      files.push({ status: status[0], previousPath: path, path: parts[index++] })
    } else {
      files.push({ status, path })
    }
  }
  return files
}

export async function getCommitFileDiff(git: SimpleGit, hash: string, path: string, language: Language): Promise<string> {
  const file = (await getCommitFiles(git, hash, language)).find((entry) => entry.path === path)
  if (!file) throw new Error(translate(language, 'Die Datei gehört nicht zu diesem Commit.'))
  const range = await commitRange(git, hash, language)
  return git.raw([
    'diff-tree', '--no-commit-id', '-r', '-M', '-p', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=3',
    ...range, '--', ...[file.previousPath, file.path].filter((value): value is string => value !== undefined).map((value) => `:(literal)${value}`)
  ])
}
