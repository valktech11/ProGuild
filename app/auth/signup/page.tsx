'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function Redirector() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const qs = new URLSearchParams()
    qs.set('tab', 'signup')
    params.forEach((v, k) => { if (k !== 'tab') qs.set(k, v) })
    router.replace(`/login?${qs.toString()}`)
  }, [])

  return null
}

export default function AuthSignupRedirect() {
  return <Suspense><Redirector /></Suspense>
}
