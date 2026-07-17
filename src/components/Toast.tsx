import React, { useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export default function ToastContainer({ toasts, onClose }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id}>
          <ToastItem toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <XCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-400 shrink-0" />,
  };

  const bgColors = {
    success: "bg-slate-900 border-emerald-500/30 text-emerald-50 text-slate-100",
    error: "bg-slate-900 border-rose-500/30 text-rose-50 text-slate-100",
    warning: "bg-slate-900 border-amber-500/30 text-amber-50 text-slate-100",
    info: "bg-slate-900 border-sky-500/30 text-sky-50 text-slate-100",
  };

  return (
    <div
      className={`pointer-events-auto flex gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md animate-slide-in ${bgColors[toast.type]} transition-all duration-300 transform`}
    >
      {icons[toast.type]}
      <div className="flex-1">
        <h4 className="text-sm font-semibold">{toast.title}</h4>
        {toast.description && (
          <p className="text-xs text-slate-400 mt-1">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer self-start p-0.5 rounded hover:bg-slate-800"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
