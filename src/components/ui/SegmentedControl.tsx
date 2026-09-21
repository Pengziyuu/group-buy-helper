import { useId, type ReactNode } from 'react'

export type SegmentedOption<T extends string> = {
  value: T
  label: ReactNode
  count?: number
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = '' }: SegmentedControlProps<T>) {
  const name = useId()
  return (
    <div className={`ui-segmented ${className}`.trim()} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="ui-segmented-option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span>
            {option.label}
            {option.count !== undefined && <> <span className="ui-segmented-count">{option.count}</span></>}
          </span>
        </label>
      ))}
    </div>
  )
}
