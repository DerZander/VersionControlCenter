import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from './LanguageContext'

export function DiffHorizontalScroll({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  const content = useRef<HTMLDivElement>(null)
  const scrollbar = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const viewport = content.current!
    const bar = scrollbar.current!
    const measure = (): void => {
      let overflow = 0
      viewport.querySelectorAll<HTMLElement>('.diff-side-cell code').forEach((code) => {
        const text = code.querySelector<HTMLElement>('span')
        if (text) overflow = Math.max(overflow, text.scrollWidth - code.clientWidth + 14)
      })
      track.current!.style.width = `${bar.clientWidth + Math.max(0, overflow)}px`
      viewport.style.setProperty('--diff-scroll-left', `${-bar.scrollLeft}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    measure()
    return () => observer.disconnect()
  }, [children])

  return (
    <div className="diff-scroll-layout">
      <div className="diff-content" ref={content}>{children}</div>
      <div className="diff-horizontal-scroll" ref={scrollbar} tabIndex={0} role="region"
        aria-label={t('Beide Vergleichsseiten horizontal scrollen')}
        onScroll={(event) => content.current?.style.setProperty('--diff-scroll-left', `${-event.currentTarget.scrollLeft}px`)}>
        <div ref={track} />
      </div>
    </div>
  )
}
