import { useEffect, useRef, useState } from 'react'
import { Check, Eye } from 'lucide-react'
import { useTranslation } from './LanguageContext'

interface ChangesViewOptionsProps {
  grouped: boolean
  onChange: (grouped: boolean) => void
}

export function ChangesViewOptions({ grouped, onChange }: ChangesViewOptionsProps): JSX.Element {
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

  return (
    <div className="changes-view-options" ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button ref={trigger} type="button" className="icon-button" title={t("Ansicht der Dateiliste")} aria-label={t("Ansicht der Dateiliste")} aria-expanded={open} aria-controls="changes-view-options" onClick={() => setOpen(!open)}><Eye size={15} /></button>
      {open && <div className="changes-view-popup" id="changes-view-options" role="group" aria-label={t("Ansicht der Dateiliste")}>
        {[{ grouped: false, label: t("Dateien direkt anzeigen") }, { grouped: true, label: t("Nach Modulen (Verzeichnissen)") }].map((option) => (
          <button type="button" key={option.label} aria-pressed={grouped === option.grouped} onClick={() => {
            onChange(option.grouped)
            setOpen(false)
            trigger.current?.focus()
          }}>
            <Check size={14} style={{ visibility: grouped === option.grouped ? 'visible' : 'hidden' }} />
            {option.label}
          </button>
        ))}
      </div>}
    </div>
  )
}
