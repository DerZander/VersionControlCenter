import { useState, type ReactNode } from 'react'
import { Check, FolderOpen, Settings2, X } from 'lucide-react'
import type { AppSettings, RecentWorkspace } from '../../shared/types'
import { useTranslation } from './LanguageContext'

interface SettingsDialogProps {
  settings: AppSettings
  currentWorkspace: string
  recentWorkspaces: RecentWorkspace[]
  onClose: () => void
  onSave: (settings: AppSettings) => void
  github: ReactNode
  connecting: boolean
}

export function SettingsDialog({ settings, currentWorkspace, recentWorkspaces, onClose, onSave, github, connecting }: SettingsDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'workspace' | 'appearance' | 'language' | 'github'>('workspace')
  const choices = [...new Set([
    ...recentWorkspaces.map((workspace) => workspace.path),
    ...(currentWorkspace ? [currentWorkspace] : []),
    ...(draft.defaultWorkspace ? [draft.defaultWorkspace] : [])
  ])]

  const chooseWorkspace = async (): Promise<void> => {
    setError('')
    try {
      const path = await window.vcc.chooseDefaultWorkspace()
      if (path) setDraft((current) => ({ ...current, defaultWorkspace: path }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      onSave(await window.vcc.saveSettings(draft))
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
      <div className="modal-card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-heading">
          <div className="modal-icon"><Settings2 size={18} /></div>
          <div><h3 id="settings-title">{t("Einstellungen")}</h3><p>{t("Workspace und Darstellung anpassen.")}</p></div>
          <button type="button" className="icon-button" aria-label={t("Einstellungen schließen")} onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="settings-tabs" role="tablist" aria-label={t("Einstellungen")} onKeyDown={(event) => {
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
          const index = tabs.findIndex((button) => button === document.activeElement)
          if (index < 0) return
          let next: number
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
          else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = tabs.length - 1
          else return
          event.preventDefault()
          tabs[next].focus()
          tabs[next].click()
        }}>
          {([
            ['workspace', 'Workspace'],
            ['appearance', t("Darstellung")],
            ['language', t("Sprache")],
            ['github', 'GitHub']
          ] as const).map(([id, label]) => (
            <button type="button" role="tab" tabIndex={tab === id ? 0 : -1} id={`settings-tab-${id}`} aria-selected={tab === id} aria-controls={`settings-panel-${id}`} key={id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="settings-panel" role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
        {tab === 'workspace' && <>
        <label>{t("Standard-Workspace")} <select value={draft.defaultWorkspace ?? ''} onChange={(event) => setDraft({ ...draft, defaultWorkspace: event.target.value || null })} disabled={busy}>
            <option value="">{t("Keiner – Startbildschirm anzeigen")}</option>
            {choices.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
        </label>
        <div className="settings-workspace-buttons">
          <button type="button" className="button button-subtle" onClick={() => void chooseWorkspace()} disabled={busy}><FolderOpen size={14} />  {t("Datei auswählen")}</button>
          {currentWorkspace && <button type="button" className="button button-subtle" onClick={() => setDraft({ ...draft, defaultWorkspace: currentWorkspace })} disabled={busy}>{t("Aktuellen verwenden")}</button>}
        </div>
        <p className="modal-hint">{t("Dieser Workspace wird beim nächsten Start automatisch geöffnet. Ohne Standard bleibt die Liste der letzten Workspaces sichtbar.")}</p>
        </>}
        {tab === 'appearance' && <>
        <label>{t('Standardansicht der Änderungen')}
          <select value={draft.changesView} onChange={(event) => setDraft({ ...draft, changesView: event.target.value === 'modules' ? 'modules' : 'files' })} disabled={busy}>
            <option value="files">{t('Dateien direkt anzeigen')}</option>
            <option value="modules">{t('Nach Modulen (Verzeichnissen)')}</option>
          </select>
        </label>
        <label>{t("Darstellung")} <select value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value === 'light' ? 'light' : 'dark' })} disabled={busy}>
            <option value="dark">{t("Dunkel")}</option>
            <option value="light">{t("Hell")}</option>
          </select>
        </label>
        <label>{t("Schriftgröße der Oberfläche:")} {draft.uiFontSize}  {t("px")} <input type="range" min={12} max={18} step={1} value={draft.uiFontSize} onChange={(event) => setDraft({ ...draft, uiFontSize: Number(event.target.value) })} disabled={busy} />
        </label>
        <label>{t("Schriftgröße der Codeansicht:")} {draft.codeFontSize}  {t("px")} <input type="range" min={10} max={24} step={1} value={draft.codeFontSize} onChange={(event) => setDraft({ ...draft, codeFontSize: Number(event.target.value) })} disabled={busy} />
        </label>
        <p className="settings-font-preview" style={{ fontSize: draft.codeFontSize }}>const workspace = "Version Control Center";</p>
        </>}
        {tab === 'language' && <label>{t("Sprache")} <select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value === 'en' ? 'en' : 'de' })} disabled={busy}>
            <option value="de">{t("Deutsch")}</option>
            <option value="en">{t("English")}</option>
          </select>
        </label>}
        {tab === 'github' && github}
        </div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button button-subtle" onClick={onClose} disabled={busy}>{t("Abbrechen")}</button>
          <button type="button" className="button button-primary" disabled={busy || connecting} onClick={() => void save()}><Check size={14} />  {t("Speichern")}</button>
        </div>
      </div>
    </div>
  )
}
