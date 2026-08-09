/**
 * The console's regions: category rail, the per-category field panels, the
 * services table, the log viewer, the danger zone, and the sticky save bar.
 *
 * Zone notes live next to the markup they justify. The one rule that runs
 * through all of them: nothing the user has to navigate *out* of is ever
 * marked `contain` — containment belongs to modal UI only, and the confirm
 * dialog in App.tsx is the only thing here that gets it.
 */
import { useState, type Ref } from 'react'
import { useLogs, useServiceAction, useServices, type LogFilter, type ServiceAction } from './api'
import { NumberField, RangeField, SelectField, SwitchField, TextAreaField, TextField } from './fields'
import { CATEGORIES, TIMEZONES, type CategoryId, type SettingsForm } from './form'

const SERVICE_ACTIONS: ServiceAction[] = ['start', 'stop', 'restart']
const LOG_FILTERS: LogFilter[] = ['all', 'error', 'warn', 'info']
/** A settings page shows a tail, not a journal — 40 focus stops is not a UI. */
const LOG_TAIL = 8

export function CategoryNav({
  current,
  onSelect,
  navRef,
}: {
  current: CategoryId
  onSelect: (id: CategoryId) => void
  navRef: Ref<HTMLElement>
}) {
  return (
    /*
      `remember` and deliberately NOT `contain`: this rail is the left half of
      the classic nav + detail split, so focus has to be able to walk right
      into the panel and back. Memory is what makes "back" comfortable — you
      return to the category you left, not to the top of the list.
    */
    <nav className="sa-cats" data-spatial-container="remember" data-testid="cats" ref={navRef}>
      <h2 className="sa-cats-heading">Configuration</h2>
      {CATEGORIES.map((category) => {
        const active = category.id === current
        return (
          <button
            key={category.id}
            type="button"
            className={`sa-cat${active ? ' is-active' : ''}`}
            data-testid="category"
            data-category={category.id}
            aria-current={active ? 'page' : undefined}
            // The active category is the page's cold-start entry point; once
            // the rail has been visited, `remember` outranks this.
            {...(active ? { 'data-spatial-autofocus': '' } : {})}
            onClick={() => onSelect(category.id)}
          >
            <span className="sa-cat-label">{category.label}</span>
            <span className="sa-cat-blurb">{category.blurb}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function GeneralFields({ form }: { form: SettingsForm }) {
  return (
    <>
      <form.Field
        name="hostname"
        validators={{
          onChange: ({ value }) =>
            /^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : 'Lowercase letters, digits, and dashes',
        }}
      >
        {(field) => <TextField field={field} label="Hostname" hint="Announced over mDNS." />}
      </form.Field>

      <form.Field name="timezone">
        {(field) => <SelectField field={field} label="Timezone" options={TIMEZONES} />}
      </form.Field>

      <form.Field name="transcodeThreads">
        {(field) => (
          <RangeField
            field={field}
            label="Transcode threads"
            hint="Left/right adjust the slider; up/down leave it."
            min={1}
            max={16}
          />
        )}
      </form.Field>

      <form.Field name="motd">
        {(field) => (
          <TextAreaField field={field} label="Message of the day" hint="Shown on every login." />
        )}
      </form.Field>
    </>
  )
}

export function NetworkFields({ form }: { form: SettingsForm }) {
  return (
    <>
      <form.Field
        name="sshPort"
        validators={{
          // Shape only. The authoritative range is the server's, so the 422
          // path stays reachable instead of being masked by a client check —
          // which is what a real deployment looks like anyway.
          onChange: ({ value }) =>
            Number.isInteger(value) ? undefined : 'Port must be a whole number',
        }}
      >
        {(field) => (
          <NumberField field={field} label="SSH port" hint="The server accepts 1–65535." min={1} />
        )}
      </form.Field>

      <form.Field name="sshPasswordAuth">
        {(field) => (
          <SwitchField field={field} label="Password authentication" hint="Keys only when off." />
        )}
      </form.Field>

      <form.Field name="remoteAccess">
        {(field) => <SwitchField field={field} label="Remote access" />}
      </form.Field>

      <form.Field
        name="maxUploadMB"
        validators={{
          onChange: ({ value }) => (value > 0 ? undefined : 'Must be greater than zero'),
        }}
      >
        {(field) => <NumberField field={field} label="Max upload (MB)" min={1} />}
      </form.Field>
    </>
  )
}

export function UpdateFields({ form }: { form: SettingsForm }) {
  return (
    <>
      <form.Field name="automaticUpdates">
        {(field) => <SwitchField field={field} label="Unattended upgrades" />}
      </form.Field>

      <form.Field name="updateChannel">
        {(field) => (
          <SelectField field={field} label="Release channel" options={['stable', 'beta', 'nightly']} />
        )}
      </form.Field>

      <form.Field name="telemetry">
        {(field) => (
          <SwitchField field={field} label="Send telemetry" hint="Anonymous crash reports only." />
        )}
      </form.Field>
    </>
  )
}

export function LoggingPanel({ form }: { form: SettingsForm }) {
  return (
    <>
      <form.Field name="logLevel">
        {(field) => (
          <SelectField field={field} label="Log level" options={['error', 'warn', 'info', 'debug']} />
        )}
      </form.Field>
      <LogViewer />
    </>
  )
}

function LogViewer() {
  const [level, setLevel] = useState<LogFilter>('all')
  const logs = useLogs(level)
  const items = (logs.data?.items ?? []).slice(0, LOG_TAIL)

  return (
    /*
      The viewer is its own zone inside the panel so "down" from the log-level
      select enters the filter row as a unit rather than picking whichever
      button happens to be nearest. `remember` keeps your place in the tail
      when you step out to change the filter and come back.
    */
    <section className="sa-logs" data-spatial-container="remember" data-testid="logs">
      <h3 className="sa-sub">Journal</h3>
      <div className="sa-log-filters" role="group" aria-label="Log level filter">
        {LOG_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`sa-chip${filter === level ? ' is-active' : ''}`}
            data-testid="log-filter"
            data-level={filter}
            aria-pressed={filter === level}
            onClick={() => setLevel(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      <ul className="sa-log-list">
        {items.map((entry) => (
          // `data-focusable` opts a non-interactive row into navigation: on a
          // remote you still need to walk the list to read it. The engine
          // gives these tabindex="-1" so they never join the Tab order.
          <li
            key={entry.id}
            className={`sa-log is-${entry.level}`}
            data-testid="log-row"
            data-focusable
          >
            <span className="sa-log-level">{entry.level}</span>
            <span className="sa-log-service">{entry.service}</span>
            <span className="sa-log-message">{entry.message}</span>
          </li>
        ))}
      </ul>
      <p className="sa-muted" data-testid="log-count">
        {logs.isPending ? 'Loading…' : `${items.length} of ${logs.data?.items.length ?? 0} lines`}
      </p>
    </section>
  )
}

export function ServicesTable({ onStatus }: { onStatus: (message: string) => void }) {
  const services = useServices()
  const act = useServiceAction()
  const items = services.data?.items ?? []

  if (services.isPending) return <p className="sa-muted">Reading unit files…</p>

  return (
    <table className="sa-table" data-testid="services">
      <thead>
        <tr>
          <th scope="col">Unit</th>
          <th scope="col">State</th>
          <th scope="col">CPU</th>
          <th scope="col">Memory</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((service) => (
          <tr key={service.id} data-testid="service-row" data-service={service.id}>
            <th scope="row">{service.name}</th>
            <td>
              <span className={`sa-state is-${service.state}`} data-testid="service-state">
                {service.state}
              </span>
            </td>
            <td className="sa-num">{service.cpuPercent}%</td>
            <td className="sa-num">{service.memoryMB} MB</td>
            <td className="sa-row-actions">
              {SERVICE_ACTIONS.map((action) => (
                // Deliberately never disabled by state. Disabling the button
                // that was just pressed destroys the focused element, and
                // focus falls to the body mid-interaction; an idempotent
                // action that stays focusable is the spatial-safe shape.
                <button
                  key={action}
                  type="button"
                  className="sa-mini"
                  data-testid="service-action"
                  data-action={action}
                  data-service={service.id}
                  onClick={() => {
                    onStatus(`${action} ${service.name}`)
                    act.mutate({ id: service.id, action })
                  }}
                >
                  {action}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DangerZone({
  onRestoreDefaults,
  onStopAll,
  busy,
}: {
  onRestoreDefaults: () => void
  onStopAll: () => void
  busy: boolean
}) {
  return (
    <div className="sa-danger">
      <p className="sa-muted">
        Both actions are confirmed with a modal dialog first — the one place in this screen where
        focus containment is correct.
      </p>
      <div className="sa-danger-row">
        <div>
          <strong>Restore factory defaults</strong>
          <p className="sa-muted">Overwrites every setting on this page.</p>
        </div>
        <button
          type="button"
          className="sa-destructive"
          data-testid="restore-defaults"
          disabled={busy}
          onClick={onRestoreDefaults}
        >
          Restore
        </button>
      </div>
      <div className="sa-danger-row">
        <div>
          <strong>Stop all services</strong>
          <p className="sa-muted">Takes every unit offline until started again.</p>
        </div>
        <button
          type="button"
          className="sa-destructive"
          data-testid="stop-all"
          disabled={busy}
          onClick={onStopAll}
        >
          Stop all
        </button>
      </div>
    </div>
  )
}

export function SaveBar({ form, onDiscard }: { form: SettingsForm; onDiscard: () => void }) {
  return (
    /*
      A plain zone, no tokens: the bar should be entered as one unit from the
      panel above and left again by pressing up. `contain` here would be the
      classic trap — a sticky bar you can never leave.
    */
    <footer className="sa-savebar" data-spatial-container="" data-testid="savebar">
      <form.Subscribe
        selector={(state) => ({
          isDirty: state.isDirty,
          isSubmitting: state.isSubmitting,
          // `errors` is the unwrapped form-level list; `errorMap.onSubmit`
          // still holds the raw `{ form, fields }` object we returned.
          formError: state.errors[0],
        })}
      >
        {({ isDirty, isSubmitting, formError }) => (
          <>
            <span className="sa-savebar-state" data-testid="dirty-state">
              {isSubmitting ? 'Saving…' : isDirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            {typeof formError === 'string' ? (
              <span className="sa-savebar-error" data-testid="form-error">
                {formError}
              </span>
            ) : null}
            <button
              type="button"
              className="sa-secondary"
              data-testid="discard"
              disabled={!isDirty || isSubmitting}
              onClick={onDiscard}
            >
              Discard
            </button>
            <button
              type="submit"
              className="sa-primary"
              data-testid="save"
              disabled={!isDirty || isSubmitting}
            >
              Save changes
            </button>
          </>
        )}
      </form.Subscribe>
    </footer>
  )
}
