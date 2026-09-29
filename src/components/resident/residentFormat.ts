// Resident-facing amounts: a bare dollar sign with thousands separators, never NT$.
// Times use the shared describeAutoClose and formatRelativeTime.
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

