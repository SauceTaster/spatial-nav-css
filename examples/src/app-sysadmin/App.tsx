/**
 * Sysadmin config console — a dense settings screen.
 *
 * What it stresses in the engine:
 *  - the classic left-nav + detail-panel split, where the panel's contents are
 *    swapped wholesale under the user's feet
 *  - native form controls, which the engine deliberately does *not* take arrow
 *    keys away from: a text box has to behave like a text box
 *  - a server-side validation failure that has to move focus to a control that
 *    may not even be mounted yet
 *  - mutations that re-render the row containing the focused button
 *  - a modal confirm, the one place where focus containment is correct
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isEditable } from 'spatial-nav-css'
import { spatialConfirm } from 'spatial-nav-css/dialogs'
import { useServices, useSaveSettings, useSettings, useStopAllServices } from './api'
import {
  CategoryNav,
  DangerZone,
  GeneralFields,
  LoggingPanel,
  NetworkFields,
  SaveBar,
  ServicesTable,
  UpdateFields,
} from './panels'
import {
  CATEGORIES,
  FACTORY_DEFAULTS,
  FIELD_CATEGORY,
  fieldDomId,
  useSettingsForm,
  type CategoryId,
  type SettingsForm,
} from './form'
import type { SystemSettings } from '../shared/api/db'

export function App() {
  const settings = useSettings()
  if (settings.isPending || !settings.data) {
    return (
      <p className="sa-muted" data-testid="booting">
        Reading /etc…
      </p>
    )
  }
  // Mounting the console only once settings exist keeps the form's
  // defaultValues honest — TanStack Form reads them exactly once.
  return <Console settings={settings.data} />
}

function Console({ settings }: { settings: SystemSettings }) {
  const [category, setCategory] = useState<CategoryId>('general')
  const [status, setStatus] = useState('Arrow keys move · Enter activates · Esc leaves a field')
  const { form, serverError } = useSettingsForm(settings)
  const catsRef = useRef<HTMLElement>(null)
  const revealed = useRef(0)

  const services = useServices()
  const save = useSaveSettings()
  const stopAll = useStopAllServices()

  /**
   * A rejected field must not just turn a label red in a panel nobody is
   * looking at. Reveal the category that owns it, then put focus on the
   * control: spatial focus is real DOM focus, so a plain `.focus()` is enough
   * and the engine adopts it through `focusin`. Re-runs after the category
   * render because the control does not exist until then.
   */
  useEffect(() => {
    if (!serverError || serverError.attempt === revealed.current) return
    const control = document.getElementById(fieldDomId(serverError.field))
    if (!control) {
      setCategory(FIELD_CATEGORY[serverError.field])
      return
    }
    revealed.current = serverError.attempt
    control.focus()
  }, [serverError, category])

  /**
   * The adapter ignores every mapped key while the target is editable, so
   * Escape inside a text box would otherwise do nothing. This is the
   * application-level escape the docs ask for — and it touches only Escape,
   * leaving the arrow keys to the browser where they belong.
   */
  const leaveFields = useCallback(() => {
    catsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
  }, [])

  const restoreDefaults = useCallback(async () => {
    const ok = await spatialConfirm('Overwrite every setting with its factory value?', {
      title: 'Restore factory defaults',
      okLabel: 'Restore',
      className: 'sa-dialog',
    })
    if (!ok) {
      setStatus('Restore cancelled')
      return
    }
    await save.mutateAsync(FACTORY_DEFAULTS)
    form.reset(FACTORY_DEFAULTS)
    setStatus('Factory defaults restored')
  }, [form, save])

  const stopEverything = useCallback(async () => {
    const ok = await spatialConfirm('Take every unit offline now?', {
      title: 'Stop all services',
      okLabel: 'Stop all',
      className: 'sa-dialog',
    })
    if (!ok) {
      setStatus('Stop cancelled')
      return
    }
    await stopAll.mutateAsync((services.data?.items ?? []).map((service) => service.id))
    setStatus('All services stopped')
  }, [services.data, stopAll])

  return (
    <div className="sa-root">
      <header className="sa-head">
        <h1>{settings.hostname}</h1>
        <p className="sa-muted" data-testid="status">
          {status}
        </p>
      </header>

      <form
        className="sa-form"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="sa-body">
          <CategoryNav current={category} onSelect={setCategory} navRef={catsRef} />

          {/*
            `remember` and never `contain`. The panel is the right half of the
            split: entering it from the rail should land where you left off,
            and left must always take you back out. Its contents are replaced
            wholesale when the category changes, which is exactly the case
            `autoRestoreFocus` exists for.
          */}
          <section
            className="sa-panel"
            data-spatial-container="remember"
            data-testid="panel"
            data-category={category}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !isEditable(event.target)) return
              event.preventDefault()
              leaveFields()
            }}
          >
            <h2 className="sa-panel-title">
              {CATEGORIES.find((entry) => entry.id === category)?.label}
            </h2>
            <PanelBody
              category={category}
              form={form}
              onStatus={setStatus}
              onRestoreDefaults={() => void restoreDefaults()}
              onStopAll={() => void stopEverything()}
              busy={save.isPending || stopAll.isPending}
            />
          </section>
        </div>

        <SaveBar
          form={form}
          onDiscard={() => {
            form.reset()
            setStatus('Changes discarded')
          }}
        />
      </form>
    </div>
  )
}

function PanelBody({
  category,
  form,
  onStatus,
  onRestoreDefaults,
  onStopAll,
  busy,
}: {
  category: CategoryId
  form: SettingsForm
  onStatus: (message: string) => void
  onRestoreDefaults: () => void
  onStopAll: () => void
  busy: boolean
}) {
  switch (category) {
    case 'general':
      return <GeneralFields form={form} />
    case 'network':
      return <NetworkFields form={form} />
    case 'updates':
      return <UpdateFields form={form} />
    case 'logging':
      return <LoggingPanel form={form} />
    case 'services':
      return <ServicesTable onStatus={onStatus} />
    case 'danger':
      return <DangerZone onRestoreDefaults={onRestoreDefaults} onStopAll={onStopAll} busy={busy} />
  }
}
