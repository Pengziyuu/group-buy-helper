import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

type FormFieldProps = {
  id: string
  label: ReactNode
  helper?: ReactNode
  error?: ReactNode
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
  className?: string
}

export function FormField({ id, label, helper, error, children, className = '' }: FormFieldProps) {
  const helperId = helper ? `${id}-helper` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [children.props['aria-describedby'], helperId, errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : children.props['aria-invalid'],
      })
    : children
  return (
    <div className={`ui-field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {control}
      {helper && <div className="ui-field-helper" id={helperId}>{helper}</div>}
      {error && <div className="ui-field-error" id={errorId} role="alert">{error}</div>}
    </div>
  )
}
