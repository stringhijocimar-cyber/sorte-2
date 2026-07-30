/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base da API. Em desenvolvimento o proxy do Vite atende em /api. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
