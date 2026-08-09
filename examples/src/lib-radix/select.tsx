/**
 * Radix Select — a portaled listbox with typeahead and its own key handling.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. Opening works. Unlike DropdownMenu, `Select.Trigger` opens from its
 *    `onClick` whenever the last pointer type was not a mouse, so the engine's
 *    synthetic click from `nav.activate()` opens it and the same call on an
 *    option commits the value.
 *
 * 2. Options are not spatial stops either. Every `role="option"` is
 *    `tabindex="-1"`, so — exactly like the menu — `data-focusable` is
 *    required to make the list navigable by direction rather than only by
 *    Radix's own ArrowUp/ArrowDown on real key events.
 *
 * 3. Containment. The default `modal` behavior aria-hides the page, which the
 *    engine's default `visibilityFilter` respects; `contain` on the content
 *    makes that independent of the visibility policy.
 *
 * 4. Typeahead is Radix's and stays Radix's. It runs off character `keydown`,
 *    a channel the spatial engine never uses, so the two never collide.
 *
 * 5. `position="popper"` rather than the default `item-aligned`, which
 *    measures the trigger and the selected item to align them and needs a real
 *    layout engine.
 */
import * as Select from '@radix-ui/react-select'

export interface SelectOption {
  value: string
  label: string
}

export function SettingSelect({
  label,
  hint,
  value,
  options,
  onValueChange,
}: {
  label: string
  hint: string
  value: string
  options: SelectOption[]
  onValueChange: (next: string) => void
}) {
  return (
    <div className="rx-row">
      <div className="rx-row-text">
        <span className="rx-row-label">{label}</span>
        <span className="rx-row-hint">{hint}</span>
      </div>
      <Select.Root value={value} onValueChange={onValueChange}>
        <Select.Trigger className="rx-btn" data-testid="select-trigger" aria-label={label}>
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="rx-listbox"
            position="popper"
            sideOffset={6}
            data-testid="select-content"
            data-spatial-container="contain"
          >
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="rx-option"
                  data-testid="select-option"
                  data-option={option.value}
                  data-focusable
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
