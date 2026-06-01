'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { Toast, Toaster, createToaster } from '@ark-ui/react/toast';
import { Portal } from '@ark-ui/react/portal';
import { Check, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, _position?: ToastPosition) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Ark UI's createToaster manages placement, overlap, and gap.
const toaster = createToaster({
  placement: 'bottom-end',
  gap: 16,
  overlap: true,
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const showToast = useCallback((message: string, type: ToastType = 'info', _position?: ToastPosition) => {
    const defaultTitles = {
      success: 'Success!',
      error: 'Error occurred',
      warning: 'Warning',
      info: 'Information',
    };

    toaster.create({
      title: defaultTitles[type],
      description: message,
      type: type,
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Portal>
        <Toaster toaster={toaster}>
          {(toast) => <ToastItem toast={toast} />}
        </Toaster>
      </Portal>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Premium, beautiful, modern toast card design that matches high-end Figma specs.
// Completely avoids overlapping borders or clipped icons by using perfectly spaced layout tokens.
const ToastItem = ({ toast }: { toast: any }) => {
  const toastTypes = {
    success: {
      icon: Check,
      colors: 'bg-emerald-50/95 dark:bg-emerald-950/90 border border-emerald-200/80 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-50 shadow-[0_8px_30px_rgb(16,185,129,0.08)]',
      iconContainer: 'bg-emerald-500 text-white rounded-full p-1 shrink-0 flex items-center justify-center shadow-sm',
    },
    error: {
      icon: AlertCircle,
      colors: 'bg-rose-50/95 dark:bg-rose-950/90 border border-rose-200/80 dark:border-rose-800/50 text-rose-900 dark:text-rose-50 shadow-[0_8px_30px_rgb(244,63,94,0.08)]',
      iconContainer: 'bg-rose-500 text-white rounded-full p-1 shrink-0 flex items-center justify-center shadow-sm',
    },
    warning: {
      icon: AlertTriangle,
      colors: 'bg-amber-50/95 dark:bg-amber-950/90 border border-amber-200/80 dark:border-amber-800/50 text-amber-900 dark:text-amber-50 shadow-[0_8px_30px_rgb(245,158,11,0.08)]',
      iconContainer: 'bg-amber-500 text-white rounded-full p-1 shrink-0 flex items-center justify-center shadow-sm',
    },
    info: {
      icon: Info,
      colors: 'bg-sky-50/95 dark:bg-sky-950/90 border border-sky-200/80 dark:border-sky-800/50 text-sky-900 dark:text-sky-50 shadow-[0_8px_30px_rgb(14,165,233,0.08)]',
      iconContainer: 'bg-sky-500 text-white rounded-full p-1 shrink-0 flex items-center justify-center shadow-sm',
    },
  };

  const config = toastTypes[toast.type as ToastType] || toastTypes.info;
  const Icon = config.icon;

  return (
    <Toast.Root
      className={`rounded-xl min-w-80 max-w-sm p-4 relative overflow-hidden transition-all duration-300 ease-default will-change-transform h-(--height) opacity-(--opacity) translate-x-(--x) translate-y-(--y) scale-(--scale) z-(--z-index) backdrop-blur-md ${config.colors}`}
    >
      <div className="flex items-start gap-3.5 pr-6">
        <div className={config.iconContainer}>
          <Icon className="w-3.5 h-3.5 stroke-[3]" />
        </div>
        <div className="flex-1 min-w-0">
          <Toast.Title className="font-bold text-sm tracking-tight">
            {toast.title}
          </Toast.Title>
          <Toast.Description className="text-xs opacity-90 mt-0.5 leading-relaxed break-words font-medium">
            {toast.description}
          </Toast.Description>
        </div>
      </div>
      <Toast.CloseTrigger className="absolute top-3 right-3 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors text-current opacity-70 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </Toast.CloseTrigger>
    </Toast.Root>
  );
};
