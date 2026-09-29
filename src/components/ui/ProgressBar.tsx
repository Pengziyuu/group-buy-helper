type ProgressBarProps = {
  label: string
  value: number
  max: number
  className?: string
  /** The threshold is reached: the fill switches to the success colour. */
  formed?: boolean
}

export function ProgressBar({ label, value, max, className = '', formed = false }: ProgressBarProps) {
  const safeMax = Math.max(1, max)
  const clampedValue = Math.min(safeMax, Math.max(0, value))
  const percent = (clampedValue / safeMax) * 100
  return (
    <div
      className={`ui-progress ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clampedValue}
      data-formed={formed ? 'true' : undefined}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}
