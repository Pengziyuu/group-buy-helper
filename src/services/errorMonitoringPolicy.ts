import type { RuntimeConfig } from './runtime'

/** Demo previews and local work stay silent, so every report is a real visitor on the real site. */
export function shouldMonitorErrors(config: RuntimeConfig, productionBuild: boolean): boolean {
  return productionBuild && config.mode === 'live'
}
