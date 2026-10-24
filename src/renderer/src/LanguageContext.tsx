import { createContext, useContext, useState, type ReactNode } from 'react'
import { translate, type Language, type TranslationKey } from '../../shared/i18n'
import { defaultSettings } from '../../shared/types'

const LanguageContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
}>({ language: defaultSettings.language, setLanguage: () => { throw new Error('LanguageProvider is missing.') } })

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [language, setLanguage] = useState<Language>(defaultSettings.language)
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useTranslation(): {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, ...values: (string | number)[]) => string
} {
  const { language, setLanguage } = useContext(LanguageContext)
  return { language, setLanguage, t: (key, ...values) => translate(language, key, ...values) }
}
