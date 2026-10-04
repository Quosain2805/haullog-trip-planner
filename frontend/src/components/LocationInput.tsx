import { useEffect, useId, useRef, useState } from 'react'
import { suggest } from '../api'
import type { Place, Suggestion } from '../types'

interface Props {
  label: string
  hint: string
  marker: string
  markerColor: string
  value: string
  place: Place | null
  onChange: (text: string, place: Place | null) => void
  error?: string
}

export default function LocationInput({ label, hint, marker, markerColor, value, place, onChange, error }: Props) {
  const id = useId()
  const [fetched, setOptions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // Derived, so stale suggestions never show once a place is chosen or the text is cleared.
  const options = place || value.trim().length < 3 ? [] : fetched

  useEffect(() => {
    const q = value.trim()
    if (place || q.length < 3) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        setOptions(await suggest(q, ctrl.signal))
        setActive(-1)
      } catch {
        /* aborted or offline: keep free-text fallback */
      } finally {
        setBusy(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [value, place])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (s: Suggestion) => {
    onChange(s.label, { lat: s.lat, lng: s.lng, label: s.label })
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="field" ref={box}>
      <label htmlFor={id}>
        <span className="pin" style={{ background: markerColor }}>{marker}</span>
        {label}
      </label>
      <div className={`input-wrap ${error ? 'has-error' : ''}`}>
        <input
          id={id}
          value={value}
          placeholder={hint}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value, null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {place ? <span className="tick" title="Location confirmed">✓</span> : busy ? <span className="spinner sm" /> : null}
      </div>
      {error && <p className="field-error">{error}</p>}
      {open && options.length > 0 && (
        <ul className="suggestions" role="listbox">
          {options.map((o, i) => (
            <li
              key={`${o.lat}-${o.lng}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{o.label}</strong>
              <span>{o.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
