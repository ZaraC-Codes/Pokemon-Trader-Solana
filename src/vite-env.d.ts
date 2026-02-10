/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POKEBALL_GAME_ADDRESS?: string;
  readonly VITE_THIRDWEB_CLIENT_ID?: string;
  readonly VITE_PUBLIC_RPC_URL?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
