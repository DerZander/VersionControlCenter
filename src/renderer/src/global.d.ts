import type { VccApi } from '../../preload'

declare global {
  interface Window {
    vcc: VccApi
  }
}

export {}
