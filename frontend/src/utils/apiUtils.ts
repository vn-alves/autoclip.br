/**
 * Funções de Ferramentas da API
 * Lidar uniformemente com URLs e solicitações de API
 */

import { apiConfigManager, getApiBaseUrl, buildApiUrl } from './apiConfig'

// Obter dinamicamente a URL base da API
export const getApiBaseUrlAsync = async () => {
  // Aguardar a configuração da API estar pronta
  await apiConfigManager.waitForReady(5000);
  return getApiBaseUrl();
}

// Construir URL completa da API
export const buildApiUrlAsync = async (path: string) => {
  // Aguardar a configuração da API estar pronta
  await apiConfigManager.waitForReady(5000);
  return buildApiUrl(path);
}

// Função fetch unificada
export const apiFetch = async (path: string, options?: RequestInit) => {
  const url = await buildApiUrlAsync(path);
  return fetch(url, options);
}

// Solicitação GET unificada
export const apiGet = async (path: string) => {
  return apiFetch(path, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

// Requisição POST unificada
export const apiPost = async (path: string, data?: any) => {
  return apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  })
}

// Solicitação PUT unificada
export const apiPut = async (path: string, data?: any) => {
  return apiFetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  })
}

// Solicitação DELETE unificada
export const apiDelete = async (path: string) => {
  return apiFetch(path, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
