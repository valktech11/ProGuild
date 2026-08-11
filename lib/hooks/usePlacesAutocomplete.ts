// lib/hooks/usePlacesAutocomplete.ts
// Attaches Google Places Autocomplete to an input ref.
// Loads the Maps JS script once (idempotent), then attaches Places to the input.
// Returns the selected address string via onSelect callback.
//
// Usage:
//   const ref = useRef<HTMLInputElement>(null)
//   usePlacesAutocomplete(ref, (addr) => setAddress(addr))

import { useEffect, RefObject } from 'react'

declare global {
  interface Window {
    google: any
    __pgPlacesCbQueue?: (() => void)[]
  }
}

function loadMapsScript(onReady: () => void) {
  if (window.google?.maps?.places) {
    onReady()
    return
  }

  // Queue multiple callers — script loads once
  if (!window.__pgPlacesCbQueue) window.__pgPlacesCbQueue = []
  window.__pgPlacesCbQueue.push(onReady)

  if (document.getElementById('gmap-script')) return  // already loading

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) {
    console.warn('[usePlacesAutocomplete] NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')
    return
  }

  window.__pgMapCb = () => {
    window.__pgPlacesCbQueue?.forEach(cb => cb())
    window.__pgPlacesCbQueue = []
  }

  const s = document.createElement('script')
  s.id  = 'gmap-script'
  s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__pgMapCb`
  s.async = true
  s.defer = true
  document.head.appendChild(s)
}

export function usePlacesAutocomplete(
  inputRef: RefObject<HTMLInputElement | null>,
  onSelect: (address: string) => void,
  options?: { types?: string[]; componentRestrictions?: { country: string } }
) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    function attach() {
      const el = inputRef.current
      if (!el || !window.google?.maps?.places) return

      const ac = new window.google.maps.places.Autocomplete(el, {
        types:                options?.types ?? ['address'],
        componentRestrictions: options?.componentRestrictions ?? { country: 'us' },
        fields:               ['formatted_address'],
      })

      const listener = ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place?.formatted_address) {
          onSelect(place.formatted_address)
        }
      })

      return () => {
        window.google?.maps?.event?.removeListener(listener)
      }
    }

    loadMapsScript(attach)
  }, []) // intentionally empty — ref is stable
}
