import type { ChangedFile } from '../../shared/types'

export interface FileTreeDirectory {
  name: string
  path: string
  directories: Map<string, FileTreeDirectory>
  files: ChangedFile[]
  count: number
}

export function buildFileTree(files: ChangedFile[]): FileTreeDirectory {
  const root: FileTreeDirectory = { name: '', path: '', directories: new Map(), files: [], count: 0 }
  for (const file of files) {
    const parts = file.path.replaceAll('\\', '/').split('/')
    parts.pop()
    let directory = root
    directory.count++
    for (const name of parts) {
      let child = directory.directories.get(name)
      if (!child) {
        child = {
          name,
          path: directory.path ? `${directory.path}/${name}` : name,
          directories: new Map(),
          files: [],
          count: 0
        }
        directory.directories.set(name, child)
      }
      directory = child
      directory.count++
    }
    directory.files.push(file)
  }
  return root
}
