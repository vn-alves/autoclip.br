/**
 * Config central dos links de download do app desktop — usada pela Landing Page e por
 * Configurações (SettingsPage). Única fonte, pra nunca ter duas URLs divergentes.
 *
 * Hoje só existe UM link real (a página de releases do GitHub, já usada em
 * SettingsPage antes desta config existir) — não há instalador por SO com nome estável:
 * o Tauri/CI nomeia os artefatos com a versão embutida (ex.: "AutoClip Desktop_1.5.0_x64-setup.exe"),
 * então um link direto tipo /releases/latest/download/<arquivo> quebraria a cada release.
 * Enquanto isso não mudar (CI passar a publicar um asset com nome fixo por SO), as duas
 * constantes abaixo apontam pra mesma página, onde o usuário escolhe o instalador certo.
 */
export const RELEASES_URL = 'https://github.com/vn-alves/autoclip.br/releases/latest'

export const WINDOWS_DOWNLOAD_URL = RELEASES_URL
export const MACOS_DOWNLOAD_URL = RELEASES_URL
