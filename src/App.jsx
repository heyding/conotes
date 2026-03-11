import { useEffect, useMemo, useState } from 'react'
import { appConfig, translations } from './i18n/translations'

const STORAGE_KEY = 'conotes:note:v1'
const LOCALE_STORAGE_KEY = 'conotes:locale:v1'

const today = new Date().toISOString().slice(0, 10)

const initialNote = {
  topic: '',
  subject: '',
  date: today,
  cues: '',
  notes: '',
  summary: '',
}

function safeFilenamePart(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
}

function buildDocumentFilename(note, text) {
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(note.date) ? note.date : today
  const subjectPart = safeFilenamePart(note.subject) || text.fileName.fallbackSubject
  const topicPart = safeFilenamePart(note.topic) || text.fileName.fallbackTopic
  return `${datePart}-${text.fileName.prefix}-${subjectPart}-${topicPart}`
}

function toMarkdown(note, text) {
  return [
    text.markdown.title,
    '',
    `${text.markdown.topic}: ${note.topic || text.markdown.missing}`,
    `${text.markdown.subject}: ${note.subject || text.markdown.missing}`,
    `${text.markdown.date}: ${note.date || text.markdown.missing}`,
    '',
    text.markdown.cues,
    note.cues || text.markdown.empty,
    '',
    text.markdown.notes,
    note.notes || text.markdown.empty,
    '',
    text.markdown.summary,
    note.summary || text.markdown.empty,
    '',
  ].join('\n')
}

function App() {
  const [locale, setLocale] = useState(appConfig.defaultLocale)
  const text =
    translations[locale] ??
    translations[appConfig.defaultLocale] ??
    translations.de

  const [note, setNote] = useState(initialNote)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [focusField, setFocusField] = useState('notes')

  useEffect(() => {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (savedLocale && translations[savedLocale]) {
      setLocale(savedLocale)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      setHasLoaded(true)
      return
    }

    try {
      const parsed = JSON.parse(raw)
      setNote((current) => ({ ...current, ...parsed }))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }

    setHasLoaded(true)
  }, [])

  useEffect(() => {
    if (!hasLoaded) {
      return
    }

    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(note))
      setLastSavedAt(new Date())
    }, 900)

    return () => clearTimeout(timer)
  }, [note, hasLoaded])

  useEffect(() => {
    if (!statusMessage) {
      return
    }

    const timer = setTimeout(() => {
      setStatusMessage('')
    }, 2300)

    return () => clearTimeout(timer)
  }, [statusMessage])

  useEffect(() => {
    const onKeyDown = async (event) => {
      const key = event.key.toLowerCase()
      const isModifierPressed = event.metaKey || event.ctrlKey

      if (isModifierPressed && event.shiftKey && key === 'f') {
        event.preventDefault()
        setFocusMode((current) => !current)
        return
      }

      if (isModifierPressed && key === 's') {
        event.preventDefault()
        saveToLocalStorage()
        return
      }

      if (isModifierPressed && event.shiftKey && key === 'm') {
        event.preventDefault()
        saveToLocalStorage()
        exportMarkdown()
        return
      }

      if (isModifierPressed && event.shiftKey && key === 'p') {
        event.preventDefault()
        saveToLocalStorage()
        await exportPdf()
        return
      }

      if (isModifierPressed && key === 'p') {
        event.preventDefault()
        if (!focusMode) {
          printCornell()
        }
        return
      }

      if (event.key === 'Escape') {
        setFocusMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusMode, saveToLocalStorage, exportMarkdown, exportPdf, printCornell])

  function onFieldChange(field) {
    return (event) => {
      const value = event.target.value
      setNote((current) => ({ ...current, [field]: value }))
    }
  }

  function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(note))
    setLastSavedAt(new Date())
    setStatusMessage(text.status.saved)
  }

  function clearAll() {
    setNote(initialNote)
    setLastSavedAt(null)
    localStorage.removeItem(STORAGE_KEY)
    setStatusMessage(text.status.reset)
  }

  function exportMarkdown() {
    const markdown = toMarkdown(note, text)
    const filename = buildDocumentFilename(note, text)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}.md`
    link.click()
    URL.revokeObjectURL(link.href)
    setStatusMessage(text.status.markdownExported)
  }

  async function exportPdf() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const left = 14
    const right = 196
    const width = right - left
    let y = 14

    const sectionTitle = (title) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text(title, left, y)
      y += 6
    }

    const sectionBody = (content) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(content || text.pdf.missing, width)
      doc.text(lines, left, y)
      y += lines.length * 5 + 4
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(text.pdf.title, left, y)
    y += 8
    doc.setDrawColor(210, 210, 210)
    doc.line(left, y, right, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`${text.pdf.topic}: ${note.topic || text.pdf.missing}`, left, y)
    y += 5
    doc.text(`${text.pdf.subject}: ${note.subject || text.pdf.missing}`, left, y)
    y += 5
    doc.text(`${text.pdf.date}: ${note.date || text.pdf.missing}`, left, y)
    y += 8

    sectionTitle(text.pdf.cues)
    sectionBody(note.cues)
    sectionTitle(text.pdf.notes)
    sectionBody(note.notes)
    sectionTitle(text.pdf.summary)
    sectionBody(note.summary)

    const filename = buildDocumentFilename(note, text)
    doc.save(`${filename}.pdf`)
    setStatusMessage(text.status.pdfExported)
  }

  function printCornell() {
    saveToLocalStorage()
    window.print()
  }



  const saveLabel = useMemo(() => {
    if (!lastSavedAt) {
      return text.status.notSavedYet
    }

    return `${text.status.lastSavedPrefix}: ${lastSavedAt.toLocaleTimeString(text.localeTag, {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }, [lastSavedAt, text.status.notSavedYet, text.status.lastSavedPrefix, text.localeTag])

  const wordCount = useMemo(() => {
    const allText = `${note.cues} ${note.notes} ${note.summary}`.trim()
    if (!allText) {
      return 0
    }

    return allText.split(/\s+/).length
  }, [note.cues, note.notes, note.summary])

  const completedFields = useMemo(() => {
    const fields = [note.topic, note.subject, note.date, note.cues, note.notes, note.summary]
    return fields.filter((field) => field.trim().length > 0).length
  }, [note])

  const focusFieldConfig = {
    cues: {
      label: text.form.cuesTitle,
      hint: text.focusPanel.cuesHint,
      placeholder: text.form.cuesPlaceholder,
      rows: 18,
    },
    notes: {
      label: text.form.notesTitle,
      hint: text.focusPanel.notesHint,
      placeholder: text.form.notesPlaceholder,
      rows: 22,
    },
    summary: {
      label: text.form.summaryTitle,
      hint: text.focusPanel.summaryHint,
      placeholder: text.form.summaryPlaceholder,
      rows: 14,
    },
  }

  const activeFocusConfig = focusFieldConfig[focusField]

  return (
    <main className={`cornell-sheet mx-auto w-full px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:p-0 ${focusMode ? 'max-w-4xl' : 'max-w-5xl'}`}>
      <section className="rounded-3xl border border-orange-200/70 bg-paper/90 p-4 shadow-[0_14px_40px_-24px_rgba(16,18,28,0.45)] backdrop-blur sm:p-8 print:rounded-none print:border-neutral-400 print:bg-white print:p-6 print:shadow-none">
        <header className="mb-6 flex flex-col gap-3 border-b border-orange-100 pb-6 sm:mb-8 print:mb-4 print:gap-2 print:border-neutral-300 print:pb-4">
          <div className="flex items-center justify-end gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setFocusMode((current) => !current)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold tracking-[0.06em] text-slate-700 uppercase transition hover:border-slate-400"
            >
              {focusMode ? text.header.focusOff : text.header.focusOn}
            </button>
            <select
              aria-label={text.language.label}
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="de">{text.language.de}</option>
              <option value="en">{text.language.en}</option>
              <option value="fr">{text.language.fr}</option>
              <option value="it">{text.language.it}</option>
            </select>
          </div>
          <h1 className="font-display text-4xl leading-[1.1] text-ink sm:text-5xl">
            {text.appName}
          </h1>
          <p className="max-w-2xl text-sm text-muted sm:text-base">
            {text.header.description}
          </p>
          <p className="text-xs text-muted print:hidden">{saveLabel}</p>
          <p className="text-xs text-muted print:hidden">
            {text.shortcuts.focusModeHint}
          </p>
          <p className="text-xs text-muted print:hidden">
            {text.shortcuts.actionHint}
          </p>
          {!focusMode && (
            <div className="grid grid-cols-3 gap-2 print:hidden sm:max-w-md">
            <div className="rounded-xl border border-orange-200/80 bg-white p-2.5">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                {text.stats.words}
              </p>
              <p className="mt-1 text-lg font-bold text-ink">{wordCount}</p>
            </div>
            <div className="rounded-xl border border-orange-200/80 bg-white p-2.5">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                {text.stats.fields}
              </p>
              <p className="mt-1 text-lg font-bold text-ink">{completedFields}/6</p>
            </div>
            <div className="rounded-xl border border-orange-200/80 bg-white p-2.5">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                {text.stats.status}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{statusMessage || text.status.ready}</p>
            </div>
            </div>
          )}
        </header>

        <form
          className="space-y-6 sm:space-y-8"
          onSubmit={(event) => {
            event.preventDefault()
            saveToLocalStorage()
          }}
          onReset={(event) => {
            event.preventDefault()
            clearAll()
          }}
        >
          {!focusMode && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                {text.form.topic}
              </span>
              <input
                type="text"
                placeholder={text.form.topicPlaceholder}
                value={note.topic}
                onChange={onFieldChange('topic')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                {text.form.subject}
              </span>
              <input
                type="text"
                placeholder={text.form.subjectPlaceholder}
                value={note.subject}
                onChange={onFieldChange('subject')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                {text.form.date}
              </span>
              <input
                type="date"
                value={note.date}
                onChange={onFieldChange('date')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>
            </div>
          )}

          {!focusMode && (
            <div className="cornell-grid overflow-hidden rounded-2xl border border-orange-100 bg-white print:rounded-none print:border-neutral-400">
              <div className="grid grid-cols-1 lg:grid-cols-[34%_66%]">
                <div className="border-b border-orange-100 bg-highlight/40 p-4 lg:border-r lg:border-b-0 sm:p-5 print:border-neutral-300 print:bg-transparent">
                  <h2 className="font-display text-2xl text-ink">{text.form.cuesTitle}</h2>
                  <p className="mt-1 text-xs text-muted sm:text-sm">
                    {text.form.cuesHint}
                  </p>
                  <textarea
                    rows={13}
                    placeholder={text.form.cuesPlaceholder}
                    value={note.cues}
                    onChange={onFieldChange('cues')}
                    className="mt-3 w-full resize-y rounded-xl border border-orange-200/80 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>

                <div className="p-4 sm:p-5">
                  <h2 className="font-display text-2xl text-ink">{text.form.notesTitle}</h2>
                  <p className="mt-1 text-xs text-muted sm:text-sm">
                    {text.form.notesHint}
                  </p>
                  <textarea
                    rows={13}
                    placeholder={text.form.notesPlaceholder}
                    value={note.notes}
                    onChange={onFieldChange('notes')}
                    className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>

              <div className="border-t border-orange-100 bg-paper p-4 sm:p-5 print:border-neutral-300 print:bg-white">
                <h2 className="font-display text-2xl text-ink">{text.form.summaryTitle}</h2>
                <p className="mt-1 text-xs text-muted sm:text-sm">
                  {text.form.summaryHint}
                </p>
                <textarea
                  rows={4}
                  placeholder={text.form.summaryPlaceholder}
                  value={note.summary}
                  onChange={onFieldChange('summary')}
                  className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          )}

          {focusMode && (
            <div className="focus-panel rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(focusFieldConfig).map(([field, config]) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => setFocusField(field)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold tracking-[0.08em] uppercase transition ${
                      focusField === field
                        ? 'bg-accent text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">{activeFocusConfig.hint}</p>
              <textarea
                rows={activeFocusConfig.rows}
                placeholder={activeFocusConfig.placeholder}
                value={note[focusField]}
                onChange={onFieldChange(focusField)}
                className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          )}

          <div className="cornell-actions sticky bottom-2 z-10 flex flex-col gap-3 rounded-2xl border border-orange-200/70 bg-paper/95 p-3 backdrop-blur print:hidden sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:flex-row sm:items-end sm:justify-between">
            <button
              type="reset"
              disabled={focusMode}
              className="order-5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 sm:order-1 sm:mr-auto sm:w-auto"
            >
              {text.actions.reset}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="submit"
                className="order-1 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-12px_rgba(255,122,61,0.9)] transition hover:brightness-95 sm:w-auto"
              >
                {text.actions.save}
              </button>
              {!focusMode && (
                <button
                  type="button"
                  onClick={() => {
                    saveToLocalStorage()
                    exportMarkdown()
                  }}
                  className="order-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto"
                >
                  {text.actions.exportMd}
                </button>
              )}
              {!focusMode && (
                <button
                  type="button"
                  onClick={async () => {
                    saveToLocalStorage()
                    await exportPdf()
                  }}
                  className="order-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto"
                >
                  {text.actions.exportPdf}
                </button>
              )}
              {!focusMode && (
                <button
                  type="button"
                  onClick={printCornell}
                  className="order-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto"
                >
                  {text.actions.print}
                </button>
              )}
              {focusMode && (
                <button
                  type="button"
                  onClick={() => setFocusMode(false)}
                  className="order-5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto"
                >
                  {text.actions.focusEnd}
                </button>
              )}
            </div>
          </div>
        </form>
      </section>
    </main>
  )
}

export default App
