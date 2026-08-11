'use client'
import { useState, useEffect } from 'react'
import { translations, Lang, TranslationKey } from './translations'
import { useProSession } from '@/lib/hooks/useProSession'

export function useTranslation() {
  const [lang, setLang] = useState<Lang>('en')
  const { session: _real } = useProSession()

  useEffect(() => {
    // Logged-in pros: honor their preferred language if set
    const pref = (_real as any)?.preferred_language
    if (pref === 'es') setLang('es')
    // Non-logged-in users: fall back to stored preference
    const stored = localStorage.getItem('tn_lang') as Lang
    if (stored && translations[stored]) setLang(stored)
  }, [_real])

  const t = (key: TranslationKey): string => {
    return translations[lang]?.[key] ?? translations['en'][key] ?? key
  }

  return { t, lang, setLang }
}
