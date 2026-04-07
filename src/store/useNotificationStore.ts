import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type AppNotification = {
  id: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: number;
  durationMs: number;

  // internal: used to ensure unreadCount increments exactly once
  _unreadBumped?: boolean;
};

type AddNotificationInput = {
  message: string;
  type?: NotificationType;
  durationMs?: number;
  id?: string;
};

type NotificationState = {
  notifications: AppNotification[];

  // bell badge
  unreadCount: number;

  // toast queue
  activeToastId: string | null;
  toastQueue: string[];

  addNotification: (input: AddNotificationInput) => string;
  markToastShown: (id: string) => void;
  dismissToast: (id: string) => void;

  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // Keep default state empty; never seed placeholder/mock notifications.
  notifications: [],
  unreadCount: 0,
  activeToastId: null,
  toastQueue: [],

  addNotification: (input) => {
    const id = input.id ?? makeId();
    const message = String(input.message ?? '').trim();
    const type: NotificationType = input.type ?? 'info';
    const durationMs = typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(500, input.durationMs)
      : 3000;

    if (!message) return id;

    set((state) => {
      const nextNotifications: AppNotification[] = [
        {
          id,
          message,
          type,
          read: false,
          createdAt: Date.now(),
          durationMs,
        },
        ...state.notifications,
      ];

      const nextQueue = [...state.toastQueue, id];
      const nextActive = state.activeToastId ?? nextQueue[0] ?? null;

      return {
        notifications: nextNotifications,
        toastQueue: nextQueue,
        activeToastId: nextActive,
      };
    });

    return id;
  },

  markToastShown: (id) => {
    set((state) => {
      const idx = state.notifications.findIndex((n) => n.id === id);
      if (idx < 0) return state;

      const item = state.notifications[idx];
      if (item.read) return state;
      if (item._unreadBumped) return state;

      const next = [...state.notifications];
      next[idx] = { ...item, _unreadBumped: true };

      return {
        notifications: next,
        unreadCount: state.unreadCount + 1,
      };
    });
  },

  dismissToast: (id) => {
    set((state) => {
      if (!id) return state;

      const nextQueue = state.toastQueue.filter((x) => x !== id);
      const nextActive = nextQueue[0] ?? null;

      return {
        toastQueue: nextQueue,
        activeToastId: nextActive,
      };
    });
  },

  markRead: (id) => {
    set((state) => {
      const idx = state.notifications.findIndex((n) => n.id === id);
      if (idx < 0) return state;

      const item = state.notifications[idx];
      if (item.read) return state;

      const next = [...state.notifications];
      next[idx] = { ...item, read: true };

      const shouldDecrement = item._unreadBumped === true;

      return {
        notifications: next,
        unreadCount: shouldDecrement ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    });
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: () => {
    set({
      notifications: [],
      unreadCount: 0,
      activeToastId: null,
      toastQueue: [],
    });
  },
}));
