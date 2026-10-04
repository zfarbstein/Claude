import { useState, type FormEvent } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Alert, Button, Checkbox, Select, TextArea, TextField } from '../components/ui'
import { cx } from '../lib/cx'
import type { CalendarEvent, Category } from '../lib/types'
import { useSaveEvent } from './api'
import {
  editEventValues,
  endsNextDay,
  newEventValues,
  toEventInput,
  validateEventForm,
  type EventFormErrors,
  type EventFormValues,
} from './eventForm'

export type EventFormMode = { kind: 'create'; date: string } | { kind: 'edit'; event: CalendarEvent }

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface EventFormProps {
  mode: EventFormMode | null
  categories: Category[]
  manageable: string[]
  onClose: () => void
}

export function EventForm({ mode, categories, manageable, onClose }: EventFormProps) {
  const title = mode?.kind === 'edit' ? 'Edit event' : 'New event'
  return (
    <Sheet open={!!mode} onClose={onClose} title={title}>
      {mode && (
        <EventFormBody
          key={mode.kind === 'edit' ? mode.event.id : mode.date}
          mode={mode}
          categories={categories}
          manageable={manageable}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function EventFormBody({ mode, categories, manageable, onClose }: EventFormProps & { mode: EventFormMode }) {
  const toast = useToast()
  const save = useSaveEvent()
  const isEdit = mode.kind === 'edit'
  const options = categories.filter((c) => manageable.includes(c.key))
  const [values, setValues] = useState<EventFormValues>(() =>
    mode.kind === 'edit' ? editEventValues(mode.event) : newEventValues(mode.date, options[0]?.key ?? ''),
  )
  const [errors, setErrors] = useState<EventFormErrors>({})
  const [scope, setScope] = useState<'single' | 'following'>('single')
  const [serverError, setServerError] = useState<string | null>(null)

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((v) => {
      const next = { ...v, [key]: value }
      if (key === 'category' && value === 'required') {
        next.required = true
        next.rsvp_enabled = false
      }
      if (key === 'required' && value === true) next.rsvp_enabled = false
      return next
    })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const found = validateEventForm(values, isEdit)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    try {
      const rows = await save.mutateAsync({
        id: isEdit ? mode.event.id : undefined,
        input: toEventInput(values),
        scope,
      })
      toast(isEdit ? (rows.length > 1 ? `${rows.length} events updated` : 'Event updated') : rows.length > 1 ? `${rows.length} events created` : 'Event created')
      onClose()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save the event.')
    }
  }

  const requiredLocked = values.category === 'required'

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField label="Title" value={values.title} onChange={(e) => set('title', e.target.value)} error={errors.title} maxLength={120} required />

      <Select label="Category" value={values.category} onChange={(e) => set('category', e.target.value)} error={errors.category}>
        {options.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>

      <Checkbox label="All day" checked={values.all_day} onChange={(e) => set('all_day', e.target.checked)} />

      <div className="grid grid-cols-2 gap-3">
        <TextField label={values.multi_day ? 'Start date' : 'Date'} type="date" value={values.start_date} onChange={(e) => set('start_date', e.target.value)} error={errors.start_date} required />
        {values.multi_day ? (
          <TextField label="End date" type="date" value={values.end_date} min={values.start_date} onChange={(e) => set('end_date', e.target.value)} error={errors.end_date} />
        ) : (
          <span />
        )}
        {!values.all_day && (
          <>
            <TextField label="Starts" type="time" value={values.start_time} onChange={(e) => set('start_time', e.target.value)} error={errors.start_time} />
            <TextField
              label="Ends"
              type="time"
              value={values.end_time}
              onChange={(e) => set('end_time', e.target.value)}
              error={errors.end_time}
              hint={endsNextDay(values) ? 'Ends the next day' : undefined}
            />
          </>
        )}
      </div>
      <Checkbox
        label="Spans more than one day"
        checked={values.multi_day}
        onChange={(e) => {
          set('multi_day', e.target.checked)
          if (e.target.checked && values.end_date < values.start_date) set('end_date', values.start_date)
        }}
      />

      {!isEdit && (
        <fieldset className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <legend className="sr-only">Repeat</legend>
          <Select label="Repeat" value={values.repeat} onChange={(e) => set('repeat', e.target.value as EventFormValues['repeat'])}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly (same date)</option>
          </Select>
          {values.repeat !== 'none' && (
            <>
              <TextField
                label={`Every how many ${values.repeat === 'daily' ? 'days' : values.repeat === 'weekly' ? 'weeks' : 'months'}?`}
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                value={values.interval}
                onChange={(e) => set('interval', Number(e.target.value))}
                error={errors.interval}
              />
              {values.repeat === 'weekly' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-slate-800" id="weekday-label">
                    On
                  </span>
                  <div role="group" aria-labelledby="weekday-label" className="grid grid-cols-7 gap-1">
                    {WEEKDAY_LABELS.map((label, i) => {
                      const on = values.by_weekday.includes(i)
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-label={label}
                          aria-pressed={on}
                          onClick={() => set('by_weekday', on ? values.by_weekday.filter((d) => d !== i) : [...values.by_weekday, i])}
                          className={cx('min-h-11 rounded-lg text-sm font-bold ring-1', on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-900 ring-slate-300')}
                        >
                          {label[0]}
                        </button>
                      )
                    })}
                  </div>
                  {errors.by_weekday && <p className="text-sm font-medium text-red-700">{errors.by_weekday}</p>}
                </div>
              )}
              <Select label="Ends" value={values.ends} onChange={(e) => set('ends', e.target.value as 'count' | 'until')}>
                <option value="count">After a number of times</option>
                <option value="until">On a date</option>
              </Select>
              {values.ends === 'count' ? (
                <TextField label="Number of times" type="number" inputMode="numeric" min={1} max={200} value={values.count} onChange={(e) => set('count', Number(e.target.value))} error={errors.count} />
              ) : (
                <TextField label="Last date" type="date" min={values.start_date} value={values.until} onChange={(e) => set('until', e.target.value)} error={errors.until} />
              )}
            </>
          )}
        </fieldset>
      )}

      <TextField label="Location" value={values.location} onChange={(e) => set('location', e.target.value)} error={errors.location} maxLength={200} />
      <TextArea label="Description" value={values.description} onChange={(e) => set('description', e.target.value)} error={errors.description} maxLength={4000} />

      <div className="flex flex-col">
        <Checkbox
          label="Required"
          description={requiredLocked ? 'Required chapter events are always required.' : 'Members are expected to attend; no RSVP.'}
          checked={values.required || requiredLocked}
          disabled={requiredLocked}
          onChange={(e) => set('required', e.target.checked)}
        />
        <Checkbox
          label="Hide from Associate Members"
          description="For rush and pledge planning. AMs won't see this event anywhere."
          checked={values.hidden_from_associates}
          onChange={(e) => set('hidden_from_associates', e.target.checked)}
        />
        <Checkbox
          label="Allow RSVPs"
          checked={values.rsvp_enabled && !values.required && !requiredLocked}
          disabled={values.required || requiredLocked}
          onChange={(e) => set('rsvp_enabled', e.target.checked)}
        />
      </div>

      {isEdit && mode.event.series_id && (
        <fieldset className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">This is a repeating event. Apply changes to:</legend>
          {(['single', 'following'] as const).map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-3">
              <input type="radio" name="scope" className="size-5 accent-brand-700" checked={scope === s} onChange={() => setScope(s)} />
              {s === 'single' ? 'This event only' : 'This and following events'}
            </label>
          ))}
          <p className="text-sm text-slate-600">To change how often it repeats, delete the remaining events and create a new series.</p>
        </fieldset>
      )}

      {serverError && <Alert>{serverError}</Alert>}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-safe-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" busy={save.isPending}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
