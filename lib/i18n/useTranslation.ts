'use client'
import { useState, useEffect } from 'react'
import { translations, Lang, TranslationKey } from './translations'

export function useTranslation() {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    // Read from session or localStorage
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s.preferred_language === 'es') setLang('es')
      } catch {}
    }
    // Also check localStorage for non-logged-in users
    const stored = localStorage.getItem('tn_lang') as Lang
    if (stored && translations[stored]) setLang(stored)
  }, [])

  const t = (key: TranslationKey): string => {
    return translations[lang]?.[key] ?? translations['en'][key] ?? key
  }

  return { t, lang, setLang }
}
