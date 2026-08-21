import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  loading?: boolean
  loadingLabel?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  children,
  className = '',
  ...props
}, ref) {
  const label = loading
    ? loadingLabel ?? (typeof children === 'string' ? `${children.replace(/中…$/, '')}中…` : '處理中…')
    : children
  return (
    <button
      ref={ref}
      type="button"
      className={`ui-button ${className}`.trim()}
      data-variant={variant}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="ui-button-spinner" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
})

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  label: string
  children: ReactNode
}

export function IconButton({ label, className = '', children, ...props }: IconButtonProps) {
  return (
    <Button
      className={`ui-icon-button ${className}`.trim()}
      aria-label={label}
      variant={props.variant ?? 'tertiary'}
      {...props}
    >
      {children}
    </Button>
  )
}
