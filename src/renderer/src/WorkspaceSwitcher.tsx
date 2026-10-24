import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Code2, FolderOpen, Pencil, Plus } from 'lucide-react'
import type { RecentWorkspace } from '../../shared/types'
import { useTranslation } from './LanguageContext'

interface WorkspaceSwitcherProps {
  name: string
  path: string
  workspaces: RecentWorkspace[]
  disabled: boolean
  onRefresh: () => Promise<void>
  onSelect: (path: string) => Promise<void>
  onOpen: () => Promise<void>
  onCreate: () => Promise<void>
  onEdit: () => void
}

export function WorkspaceSwitcher({ name, path, workspaces, disabled, onRefresh, onSelect, onOpen, onCreate, onEdit }: WorkspaceSwitcherProps): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const choose = (action: () => Promise<void>): void => {
    setOpen(false)
    trigger.current?.focus()
    void action()
  }
  const choices = workspaces.some((workspace) => workspace.path === path)
    ? workspaces
    : [{ path, name, lastOpenedAt: '' }, ...workspaces]

  return (
    <div className="workspace-controls" ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button ref={trigger} className="workspace-switcher" aria-expanded={open} aria-controls="workspace-dropdown" disabled={disabled} onClick={() => {
        setOpen(!open)
        if (!open) void onRefresh()
      }}>
        <span className="workspace-icon"><Code2 size={16} /></span>
        <span className="workspace-name"><small>{t("WORKSPACE")}</small><strong>{name}</strong></span>
        <ChevronDown size={15} />
      </button>
      {open && <div className="workspace-dropdown" id="workspace-dropdown" aria-label={t("Workspaces")}>
        <div className="workspace-choices">
          {choices.map((workspace) => (
            <button key={workspace.path} className="workspace-choice" title={workspace.path} aria-current={workspace.path === path ? 'true' : undefined} onClick={() => {
              choose(() => workspace.path === path ? Promise.resolve() : onSelect(workspace.path))
            }}>
              <FolderOpen size={15} />
              <span><strong>{workspace.name}</strong><small>{workspace.path}</small></span>
              {workspace.path === path && <Check size={14} />}
            </button>
          ))}
        </div>
        <div className="workspace-dropdown-actions">
          <button onClick={() => { setOpen(false); onEdit() }}><Pencil size={15} /> {t('Workspace bearbeiten')}</button>
          <button onClick={() => choose(onOpen)}><FolderOpen size={15} />  {t("Workspace öffnen …")}</button>
          <button onClick={() => choose(onCreate)}><Plus size={15} />  {t("Workspace erstellen …")}</button>
        </div>
      </div>}
    </div>
  )
}
