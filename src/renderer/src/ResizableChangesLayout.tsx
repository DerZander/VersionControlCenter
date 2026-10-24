import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from './LanguageContext'

export function ResizableChangesLayout({ children }: { children: [ReactNode, ReactNode] }): JSX.Element {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; offset: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [ratio, setRatio] = useState(0.38)
  const [dragging, setDragging] = useState(false)
  const available = Math.max(0, width - 6)
  const minimum = Math.min(220, available / 2)
  const maximum = Math.max(minimum, available - 280)
  const left = Math.max(minimum, Math.min(maximum, available * ratio))

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const resize = (value: number): void => {
    if (available > 0) setRatio(Math.max(minimum, Math.min(maximum, value)) / available)
  }

  return (
    <div ref={container} className={`changes-layout${dragging ? ' resizing' : ''}`} style={{
      gridTemplateColumns: width ? `${left}px 6px minmax(0, 1fr)` : 'minmax(0, 38fr) 6px minmax(0, 62fr)'
    }}>
      {children[0]}
      <div
        className="changes-resizer"
        role="separator"
        aria-label={t("Breite der Dateiliste")}
        aria-orientation="vertical"
        aria-valuemin={Math.round(minimum)}
        aria-valuemax={Math.round(maximum)}
        aria-valuenow={Math.round(left)}
        aria-valuetext={t('{0} Pixel', Math.round(left))}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { pointerId: event.pointerId, offset: event.clientX - event.currentTarget.getBoundingClientRect().left }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId || !container.current) return
          resize(event.clientX - container.current.getBoundingClientRect().left - drag.current.offset)
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return
          event.currentTarget.releasePointerCapture(event.pointerId)
          drag.current = null
          setDragging(false)
        }}
        onLostPointerCapture={() => {
          drag.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragging(false)
        }}
        onDoubleClick={() => setRatio(0.38)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 50 : 10
          if (event.key === 'ArrowLeft') resize(left - step)
          else if (event.key === 'ArrowRight') resize(left + step)
          else if (event.key === 'Home') resize(minimum)
          else if (event.key === 'End') resize(maximum)
          else return
          event.preventDefault()
        }}
      />
      {children[1]}
    </div>
  )
}
