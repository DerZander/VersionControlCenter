import { useState } from 'react'
import { Check, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import type { Workspace } from '../../shared/types'
import { useTranslation } from './LanguageContext'

interface WorkspaceEditorProps {
  workspace: Workspace
  onClose: () => void
  onSaved: (workspace: Workspace) => void
}

export function WorkspaceEditor({ workspace, onClose, onSaved }: WorkspaceEditorProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState(workspace.name)
  const [repositories, setRepositories] = useState(workspace.repositories)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const add = async (scan: boolean): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const paths = await (scan ? window.vcc.scanFolder() : window.vcc.addRepositories())
      if (paths) {
        if (!paths.length) setError(t('Im ausgewählten Ordner wurden keine Repositories gefunden.'))
        setRepositories((current) => {
          const seen = new Set(current.map((path) => path.toLowerCase()))
          return [...current, ...paths.filter((path) => {
            const key = path.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })]
        })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onSaved(await window.vcc.updateWorkspace({ name: name.trim(), repositories }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <form className="modal-card workspace-editor" role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title" onSubmit={(event) => void save(event)}>
        <div className="modal-heading">
          <div className="modal-icon"><FolderOpen size={18} /></div>
          <div><h3 id="workspace-editor-title">{t('Workspace bearbeiten')}</h3></div>
          <button type="button" className="icon-button" aria-label={t('Schließen')} disabled={busy} onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('Workspace-Name')}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label>
        <div className="settings-workspace-buttons">
          <button type="button" className="button button-subtle" disabled={busy} onClick={() => void add(false)}><Plus size={14} />{t('Repository hinzufügen')}</button>
          <button type="button" className="button button-subtle" disabled={busy} onClick={() => void add(true)}><FolderOpen size={14} />{t('Ordner durchsuchen')}</button>
        </div>
        <div className="workspace-editor-repositories">
          {repositories.map((path) => <div key={path}>
            <span title={path}>{path}</span>
            <button type="button" className="icon-button" title={t('Aus Workspace entfernen')} aria-label={`${t('Aus Workspace entfernen')}: ${path}`} disabled={busy} onClick={() => setRepositories((current) => current.filter((entry) => entry !== path))}><Trash2 size={15} /></button>
          </div>)}
          {!repositories.length && <p className="modal-hint">{t('Noch keine Repositories.')}</p>}
        </div>
        <p className="modal-hint">{t('Entfernen ändert nur die Workspace-Zuordnung. Dateien und Git-Repositories bleiben auf der Festplatte erhalten.')}</p>
        {error && <div className="inline-warning" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button-subtle" disabled={busy} onClick={onClose}>{t('Abbrechen')}</button>
          <button type="submit" className="button button-primary" disabled={busy || !name.trim()}><Check size={14} />{t('Speichern')}</button>
        </div>
      </form>
    </div>
  )
}
