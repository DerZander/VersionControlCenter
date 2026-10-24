const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const { test } = require('node:test')

const compiled = ts.transpileModule(fs.readFileSync('src\\shared\\i18n.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const exportsObject = {}
vm.runInNewContext(compiled, { exports: exportsObject })
const { english, translate } = exportsObject

test('all translations preserve parameter placeholders and support both languages', () => {
  for (const [key, value] of Object.entries(english)) {
    assert.ok(value.trim(), `Empty translation: ${key}`)
    const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
    assert.deepEqual(placeholders(key), placeholders(value), `Parameters differ: ${key}`)
  }
  assert.equal(translate('de', '{0} voraus · {1} zurück', 3, 2), '3 voraus · 2 zurück')
  assert.equal(translate('en', '{0} voraus · {1} zurück', 3, 2), '3 ahead · 2 behind')
  assert.equal(translate('en', 'Einstellungen'), 'Settings')
})

test('every literal translation key in the application has an English translation', () => {
  const files = [
    ...fs.readdirSync('src\\main').filter(file => file.endsWith('.ts')).map(file => path.join('src', 'main', file)),
    ...fs.readdirSync('src\\renderer\\src').filter(file => file.endsWith('.tsx')).map(file => path.join('src', 'renderer', 'src', file))
  ]
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    function visit(node) {
      if (ts.isCallExpression(node) && ['t', 'translate'].includes(node.expression.getText(source))) {
        const key = node.arguments[node.expression.getText(source) === 't' ? 0 : 1]
        if (key && ts.isStringLiteral(key)) assert.ok(Object.hasOwn(english, key.text), `${file}: missing ${key.text}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
})
