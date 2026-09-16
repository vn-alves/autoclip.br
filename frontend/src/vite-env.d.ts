/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Chave de API do projeto PostHog (chave pública, pode ser empacotada no frontend). Se não configurada, o rastreamento é desativado. */
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  /** Endereço da instância PostHog, EUA: https://us.i.posthog.com, UE: https://eu.i.posthog.com */
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  const content: string
  export default content
}

declare module '*.svg?react' {
  import React from 'react'
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>
  export default ReactComponent
}