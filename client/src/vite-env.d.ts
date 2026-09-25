/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERSIST_MIN_SEGMENT_MS?: string;
  readonly VITE_PERSIST_MAX_SEGMENT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
