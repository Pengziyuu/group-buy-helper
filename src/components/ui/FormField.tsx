import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

type ControlProps = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}

type FormFieldProps = {
  id: string
  label: ReactNode
  helper?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactElement<ControlProps>
  className?: string
}

export function FormField({ id, label, helper, error, required = false, children, className = '' }: FormFieldProps) {
  const helperId = helper ? `${id}-helper` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [children.props['aria-describedby'], helperId, errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-required': required ? true : children.props['aria-required'],
      })
    : children
  return (
    <div className={`ui-field ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required && <span className="ui-field-required" aria-hidden="true">必填</span>}
      </label>
      {control}
      {helper && <div className="ui-field-helper" id={helperId}>{helper}</div>}
      {error && <div className="ui-field-error" id={errorId} role="alert">{error}</div>}
    </div>
  )
}
