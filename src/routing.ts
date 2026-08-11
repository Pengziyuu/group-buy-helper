export type AppMode = 'resident' | 'admin'

export function selectAppMode(pathname: string): AppMode {
  return pathname.replace(/\/+$/, '') === '/admin' ? 'admin' : 'resident'
}
