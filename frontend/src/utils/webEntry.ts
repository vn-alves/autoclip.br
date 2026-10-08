/**
 * Marca, só na Web (sessionStorage — por aba), que o usuário já entrou na plataforma pela
 * Landing Page. Sem isso, qualquer "voltar ao início" dentro do app (Header, botão Voltar de
 * ProjectDetailPage etc., todos navegam pra "/") reabriria a Landing Page em vez do app de
 * verdade — "/" serve as duas coisas na Web (Landing OU HomePage), e essa flag é o que
 * desempata depois da primeira entrada. Ver App.tsx.
 */
const KEY = 'autoclip:web:entered'

export function markEnteredApp(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // sessionStorage indisponível (navegação privada estrita etc.) — pior caso, a Landing
    // pode reaparecer ao clicar em "voltar ao início"; não é crítico.
  }
}

export function hasEnteredApp(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
