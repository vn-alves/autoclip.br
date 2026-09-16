import React from 'react';
import { List, Card, Button, Space, Typography, Tag, Badge } from 'antd';
import { CheckOutlined, DeleteOutlined, InfoCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Configurar plugin dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

const { Text, Paragraph } = Typography;

interface Notification {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
}

interface NotificationListProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  maxHeight?: number;
}

const getNotificationIcon = (level: Notification['level']) => {
  switch (level) {
    case 'info':
      return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    case 'success':
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    case 'warning':
      return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    case 'error':
      return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    default:
      return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
  }
};

const getNotificationColor = (level: Notification['level']) => {
  switch (level) {
    case 'info':
      return 'blue';
    case 'success':
      return 'green';
    case 'warning':
      return 'orange';
    case 'error':
      return 'red';
    default:
      return 'default';
  }
};

const formatTime = (timestamp: string) => {
  // Lidar corretamente com a conversão de fuso horário para garantir a exibição da hora local
  const now = dayjs().tz('Asia/Shanghai');
  const notificationTime = dayjs(timestamp).tz('Asia/Shanghai');
  const diff = now.diff(notificationTime, 'millisecond');
  
  if (diff < 60000) { // Em 1 minuto
    return 'Agora mesmo';
  } else if (diff < 3600000) { // Em 1 hora
    return `${Math.floor(diff / 60000)}minutos atrás`;
  } else if (diff < 86400000) { // Dentro de 24 horas
    return `${Math.floor(diff / 3600000)}horas atrás`;
  } else {
    return notificationTime.format('MM-DD HH:mm');
  }
};

export const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  unreadCount,
  onMarkAsRead,
  onRemove,
  onMarkAllAsRead,
  onClearAll,
  maxHeight = 400
}) => {
  const renderNotification = (notification: Notification) => (
    <List.Item
      key={notification.id}
      style={{
        padding: '8px 0',
        opacity: notification.read ? 0.7 : 1,
        backgroundColor: notification.read ? '#f5f5f5' : 'transparent',
        borderRadius: 4,
        marginBottom: 4
      }}
      actions={[
        <Button
          key="read"
          type="text"
          size="small"
          icon={<CheckOutlined />}
          onClick={() => onMarkAsRead(notification.id)}
          disabled={notification.read}
        >
          Marcar como lido
        </Button>,
        <Button
          key="remove"
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onRemove(notification.id)}
        >
          Excluir
        </Button>
      ]}
    >
      <List.Item.Meta
        avatar={getNotificationIcon(notification.level)}
        title={
          <Space>
            <Text strong={!notification.read}>
              {notification.title}
            </Text>
            <Tag color={getNotificationColor(notification.level)}>
              {notification.level}
            </Tag>
            {!notification.read && <Badge status="processing" />}
          </Space>
        }
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            <Paragraph style={{ margin: 0, fontSize: 12 }}>
              {notification.message}
            </Paragraph>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {formatTime(notification.timestamp)}
            </Text>
          </Space>
        }
      />
    </List.Item>
  );

  return (
    <Card
      title={
        <Space>
          <span>Notificações</span>
          {unreadCount > 0 && (
            <Badge count={unreadCount} size="small" />
          )}
        </Space>
      }
      extra={
        <Space>
          {unreadCount > 0 && (
            <Button size="small" onClick={onMarkAllAsRead}>
              Marcar tudo como lido
            </Button>
          )}
          <Button size="small" danger onClick={onClearAll}>
            Limpar
          </Button>
        </Space>
      }
      styles={{
        body: { padding: 12 }
      }}
    >
      <div style={{ maxHeight, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
            Nenhuma notificação
          </div>
        ) : (
          <List
            dataSource={notifications}
            renderItem={renderNotification}
            pagination={false}
          />
        )}
      </div>
    </Card>
  );
}; 