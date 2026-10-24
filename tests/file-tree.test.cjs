const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const compiled = ts.transpileModule(fs.readFileSync('src\\renderer\\src\\fileTree.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const exportsObject = {}
vm.runInNewContext(compiled, { exports: exportsObject })
const { buildFileTree } = exportsObject
const file = path => ({ path, index: ' ', workingDir: 'M', staged: false, status: 'M' })

test('module tree keeps root files and creates every intermediate directory', () => {
  const files = [file('root.txt'), file('src/main/index.ts'), file('src/test/example.ts'), file('src/main/other.ts')]
  const root = buildFileTree(files)
  assert.equal(root.count, 4)
  assert.equal(root.files[0], files[0])
  const src = root.directories.get('src')
  assert.equal(root.directories.size, 1)
  assert.equal(src.count, 3)
  assert.equal(src.files.length, 0)
  assert.equal(src.directories.size, 2)
  assert.equal(src.directories.get('main').path, 'src/main')
  assert.equal(src.directories.get('main').count, 2)
  assert.equal(src.directories.get('main').files[0], files[1])
  assert.equal(src.directories.get('test').count, 1)
})

test('module tree handles Windows separators and same filenames in different directories', () => {
  const root = buildFileTree([file('left\\nested\\same.txt'), file('right/same.txt')])
  assert.equal(root.directories.get('left').directories.get('nested').path, 'left/nested')
  assert.equal(root.directories.get('left').directories.get('nested').files[0].path, 'left\\nested\\same.txt')
  assert.equal(root.directories.get('right').files[0].path, 'right/same.txt')
  assert.equal(root.count, 2)
  assert.equal(buildFileTree([]).directories.size, 0)
})
