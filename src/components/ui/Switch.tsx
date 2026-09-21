import { useId, type ReactNode } from 'react'

type SwitchProps = {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Switch({ label, description, checked, onChange, disabled = false, className = '' }: SwitchProps) {
  const id = useId()
  const descriptionId = description ? `${id}-description` : undefined
  return (
    <div className={`ui-switch ${className}`.trim()}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {description && <p id={descriptionId} className="ui-switch-description">{description}</p>}
    </div>
  )
}
