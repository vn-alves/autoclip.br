import React, { useState, useEffect } from 'react';
import { useWebSocket, WebSocketEventMessage } from '../hooks/useWebSocket';

interface InlineProgressBarProps {
  projectId: string;
  currentStep?: number;
  totalSteps?: number;
  status?: string;
  onProgressUpdate?: (progress: number, step: string) => void;
}

interface ProgressData {
  progress: number;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  stepDetails?: string;
}

// Configuração da etapa do pipeline
const PIPELINE_STEPS = [
  { id: 1, name: 'Extração de Tópicos', description: 'Extrair um esboço estrutural do texto transcrito do vídeo' },
  { id: 2, name: 'Localização Temporal', description: 'Localizar intervalos de tempo de tópicos com base em legendas SRT' },
  { id: 3, name: 'Pontuação de Conteúdo', description: 'Avaliar a qualidade do clipe e o potencial de disseminação em múltiplas dimensões' },
  { id: 4, name: 'Geração de Título', description: 'Gerar títulos atraentes para clipes de alta pontuação' },
  { id: 5, name: 'Agrupamento de Temas', description: 'Agrupar fragmentos relacionados em coleções recomendadas' },
  { id: 6, name: 'Corte de Vídeo', description: 'Usar FFmpeg para gerar clipes e vídeos de coleção' }
];

export const InlineProgressBar: React.FC<InlineProgressBarProps> = ({
  projectId,
  currentStep = 0,
  totalSteps = 6,
  status = 'processing',
  onProgressUpdate
}) => {
  // Obter o nome da etapa pelo ID da etapa
  const getStepName = (stepId: number): string => {
    const step = PIPELINE_STEPS.find(s => s.id === stepId);
    return step ? step.name : 'Processando...';
  };

  const [progressData, setProgressData] = useState<ProgressData>({
    progress: currentStep > 0 ? Math.round((currentStep / totalSteps) * 100) : 0,
    currentStep: currentStep,
    totalSteps: totalSteps,
    stepName: currentStep > 0 ? getStepName(currentStep) : 'Inicializando...',
    stepDetails: ''
  });

  // Conexão WebSocket para atualizações de progresso em tempo real
  const { isConnected, syncSubscriptions } = useWebSocket({
    userId: `homepage-user`, // Usar um ID de usuário unificado para evitar conexões duplicadas
    onMessage: (message: WebSocketEventMessage) => {
      console.log('InlineProgressBar recebeu mensagem WebSocket:', message);
      if (message.type === 'task_progress_update' && 
          message.project_id === projectId) {
        handleProgressUpdate(message);
      }
    }
  });

  // Processar atualização de progresso
  const handleProgressUpdate = (message: any) => {
    console.log('InlineProgressBar processa atualização de progresso:', message);
    
    const newProgress = message.progress || 0;
    const stepName = message.step_name || 'Processando...';
    const stepDetails = message.message || '';
    
    // Verificação de mensagem de snapshot - evitar fallback
    if (message.snapshot && progressData.progress > newProgress) {
      console.log('Ignorar mensagens de snapshot antigas:', { current: progressData.progress, snapshot: newProgress });
      return;
    }
    
    console.log('Atualizar dados de progresso:', { newProgress, stepName, stepDetails });
    
    setProgressData(prev => ({
      ...prev,
      progress: newProgress,
      stepName: stepName,
      stepDetails: stepDetails
    }));

    // Notificar componente pai
    onProgressUpdate?.(newProgress, stepName);
  };

  // Monitorar mudanças nas props, atualizar dados de progresso
  useEffect(() => {
    const newProgress = currentStep > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
    const newStepName = currentStep > 0 ? getStepName(currentStep) : 'Inicializando...';
    
    setProgressData(prev => ({
      ...prev,
      progress: newProgress,
      currentStep: currentStep,
      totalSteps: totalSteps,
      stepName: newStepName
    }));
  }, [currentStep, totalSteps]);

  // Assinar atualizações de progresso do projeto
  useEffect(() => {
    console.log('Status do WebSocket InlineProgressBar:', { isConnected, projectId });
    if (isConnected && projectId) {
      console.log('Assinar progresso do projeto:', projectId);
      syncSubscriptions([projectId]);
    }
  }, [isConnected, projectId, syncSubscriptions]);

  // Calcular porcentagem da largura da barra de progresso
  const progressPercentage = Math.min(Math.max(progressData.progress, 0), 100);
  

  // Gerar gradiente de fundo da barra de progresso
  const getProgressGradient = () => {
    const baseColor = '#1890ff';
    const lightColor = '#40a9ff';
    
    return `linear-gradient(90deg, 
      ${baseColor} 0%, 
      ${lightColor} ${progressPercentage}%, 
      rgba(24, 144, 255, 0.1) ${progressPercentage}%, 
      rgba(24, 144, 255, 0.1) 100%)`;
  };

  // Gerar efeito de animação
  const getAnimationStyle = () => {
    return {
      background: getProgressGradient()
    };
  };

  return (
    <div style={{
      background: 'rgba(24, 144, 255, 0.15)',
      border: '1px solid rgba(24, 144, 255, 0.3)',
      borderRadius: '4px',
      padding: '6px 12px',
      position: 'relative',
      overflow: 'hidden',
      height: '32px', // Altura fixa
      display: 'flex',
      alignItems: 'center'
    }}>
      {/* Fundo da barra de progresso */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        ...getAnimationStyle()
      }} />
      
      {/* Camada de Conteúdo - Layout de Linha Única */}
      <div style={{ 
        position: 'relative', 
        zIndex: 1,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px'
      }}>
        {/* Esquerda: Nome da etapa */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: '0',
          flex: '1'
        }}>
          <span style={{ 
            color: '#1890ff',
            fontSize: '12px', 
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {progressData.stepName}
          </span>
        </div>
        
        {/* Intermediário: barra de progresso */}
        <div style={{
          width: '80px',
          height: '4px',
          background: 'rgba(24, 144, 255, 0.2)',
          borderRadius: '2px',
          overflow: 'hidden',
          flexShrink: 0
        }}>
          <div style={{
            width: `${progressPercentage}%`,
            height: '100%',
            background: status === 'processing' && progressData.progress < 100 ? 
              'linear-gradient(90deg, #1890ff, #40a9ff, #1890ff)' :
              'linear-gradient(90deg, #1890ff, #40a9ff)',
            borderRadius: '2px',
            transition: 'width 0.3s ease-in-out',
            animation: status === 'processing' && progressData.progress < 100 ? 
              'progressBarPulse 2s infinite ease-in-out' : 'none'
          }} />
        </div>
        
        {/* Direita: Informações de progresso */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0
        }}>
          <span style={{ 
            color: '#1890ff',
            fontSize: '10px',
            opacity: 0.8
          }}>
            {progressData.currentStep}/{progressData.totalSteps}
          </span>
          <span style={{ 
            color: '#1890ff',
            fontSize: '10px',
            fontWeight: 600,
            minWidth: '28px'
          }}>
            {Math.round(progressPercentage)}%
          </span>
        </div>
      </div>
      
      {/* Adicionar animação CSS */}
      <style>{`
        @keyframes progressBarPulse {
          0%, 100% {
            opacity: 1;
            transform: scaleY(1);
          }
          50% {
            opacity: 0.8;
            transform: scaleY(1.1);
          }
        }
      `}</style>
    </div>
  );
};

export default InlineProgressBar;
