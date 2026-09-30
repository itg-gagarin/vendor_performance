import { createContext, useContext } from 'react'
import type { AppConfig } from '../config/types'
import type { Formatter } from '../engine/format'

export interface UiContext {
  cfg: AppConfig
  f: Formatter
}

export const Ctx = createContext<UiContext | null>(null)

export function useUi(): UiContext {
  const c = useContext(Ctx)
  if (!c) throw new Error('UiContext missing')
  return c
}
