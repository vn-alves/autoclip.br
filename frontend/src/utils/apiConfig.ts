/**
 * Gerenciador de Configuração da API
 * Lidar com configuração dinâmica de endereço e porta do backend
 */

interface ApiConfig {
  baseUrl: string;
  port: number;
  isReady: boolean;
}

class ApiConfigManager {
  private static instance: ApiConfigManager;
  private config: ApiConfig = {
    baseUrl: '/api/v1',
    port: 0,
    isReady: false
  };
  private listeners: Array<(config: ApiConfig) => void> = [];

  private constructor() {
    this.initializeConfig();
  }

  static getInstance(): ApiConfigManager {
    if (!ApiConfigManager.instance) {
      ApiConfigManager.instance = new ApiConfigManager();
    }
    return ApiConfigManager.instance;
  }

  private async initializeConfig() {
    // Verificar se está no ambiente Tauri
    if (typeof window !== 'undefined' && ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)) {
      try {
        // Escutar evento de inicialização do backend
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');
        
        await listen('backend-started', (event: any) => {
          const backendStatus = event.payload;
          if (backendStatus && backendStatus.port) {
            this.updateFromPort(backendStatus.port);
          }
        });

        const backendStatus = await invoke('get_service_status') as any;
        if (backendStatus?.is_running && backendStatus?.port) {
          this.updateFromPort(backendStatus.port);
        }

        // Tentar obter a configuração de variáveis globais
        if ((window as any).__BACKEND_BASE__) {
          this.updateConfig({
            baseUrl: (window as any).__BACKEND_BASE__,
            port: this.extractPortFromUrl((window as any).__BACKEND_BASE__),
            isReady: true
          });
        }
      } catch (error) {
        console.warn('Não foi possível inicializar o listener de eventos Tauri:', error);
      }
    }
  }

  private updateFromPort(port: number) {
    this.updateConfig({
      baseUrl: `http://127.0.0.1:${port}/api/v1`,
      port,
      isReady: true
    });
  }

  private extractPortFromUrl(url: string): number {
    const match = url.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private updateConfig(newConfig: Partial<ApiConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.notifyListeners();
  }

  private notifyListeners() {
    // O listener de waitForReady se removerá no callback; iterar diretamente sobre o array original pulará o próximo listener,
    // Causando o 2º, 4º na fila durante a inicialização a frio… solicitações esperam 30s para expirar antes de serem enviadas (é por isso que a página de configurações abre lentamente)
    [...this.listeners].forEach(listener => listener(this.config));
  }

  /**
   * Obter configuração atual da API
   */
  getConfig(): ApiConfig {
    return { ...this.config };
  }

  /**
   * Obter URL base da API
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Verificar se a API está pronta
   */
  isReady(): boolean {
    return this.config.isReady;
  }

  /**
   * Adicionar ouvinte de mudança de configuração
   */
  addListener(listener: (config: ApiConfig) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Aguardando API pronta
   */
  async waitForReady(timeout: number = 30000): Promise<boolean> {
    if (this.isReady()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false);
      }, timeout);

      const removeListener = this.addListener((config) => {
        if (config.isReady) {
          clearTimeout(timeoutId);
          removeListener();
          resolve(true);
        }
      });
    });
  }

  /**
   * Resolve um caminho absoluto do backend (ex.: '/api/v1/projects/1/clips/2') na URL
   * certa. No app desktop a interface roda em tauri.localhost e o backend numa porta
   * aleatória, então um caminho relativo cai num servidor que não existe (404) —
   * <video>, <img> e fetch() não passam pelo baseURL do axios.
   */
  resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const origin = this.config.baseUrl.replace(/\/api\/v1\/?$/, '');
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Construir URL completo da API
   */
  buildUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.config.baseUrl}${normalizedPath}`;
  }

  /**
   * Verificação de saúde
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.buildUrl('/health'), {
        method: 'GET',
        timeout: 5000
      } as any);
      return response.ok;
    } catch (error) {
      console.warn('Verificação de saúde da API falhou:', error);
      return false;
    }
  }
}

// Exportar instância singleton
export const apiConfigManager = ApiConfigManager.getInstance();

// Exportar funções de conveniência
export const getApiBaseUrl = () => apiConfigManager.getBaseUrl();
export const isApiReady = () => apiConfigManager.isReady();
export const waitForApiReady = (timeout?: number) => apiConfigManager.waitForReady(timeout);
export const buildApiUrl = (path: string) => apiConfigManager.buildUrl(path);
export const resolveApiUrl = (path: string) => apiConfigManager.resolveUrl(path);
export const checkApiHealth = () => apiConfigManager.healthCheck();
