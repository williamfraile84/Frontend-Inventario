import React from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X
} from "lucide-react";

export default function ToastNotification({ toasts = [], onClose }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notificaciones del sistema"
      className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 left-3 sm:left-auto z-50 flex flex-col gap-2.5 max-w-full sm:max-w-md w-full pointer-events-none pb-safe"
    >
      {toasts.map((toast) => {
        const isError = toast.type === "error";
        const isWarning = toast.type === "warning";
        const isInfo = toast.type === "info";

        let config = {
          border: "border-emerald-500/80",
          bg: "bg-slate-950/95 sm:bg-slate-900/95",
          shadow: "shadow-emerald-950/40",
          iconColor: "text-emerald-400",
          barColor: "bg-emerald-500",
          Icon: CheckCircle2,
        };

        if (isError) {
          config = {
            border: "border-rose-500/80",
            bg: "bg-slate-950/95 sm:bg-slate-900/95",
            shadow: "shadow-rose-950/40",
            iconColor: "text-rose-400",
            barColor: "bg-rose-500",
            Icon: AlertCircle,
          };
        } else if (isWarning) {
          config = {
            border: "border-amber-500/80",
            bg: "bg-slate-950/95 sm:bg-slate-900/95",
            shadow: "shadow-amber-950/40",
            iconColor: "text-amber-400",
            barColor: "bg-amber-500",
            Icon: AlertTriangle,
          };
        } else if (isInfo) {
          config = {
            border: "border-sky-500/80",
            bg: "bg-slate-950/95 sm:bg-slate-900/95",
            shadow: "shadow-sky-950/40",
            iconColor: "text-sky-400",
            barColor: "bg-sky-500",
            Icon: Info,
          };
        }

        const { Icon, border, bg, shadow, iconColor, barColor } = config;

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border ${border} ${bg} ${shadow} shadow-2xl backdrop-blur-md px-4 py-3 text-white transition-all transform duration-300 animate-in fade-in slide-in-from-bottom-4`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>

              <div className="flex-1 min-w-0 pr-2">
                {toast.title && (
                  <h4 className="text-sm font-bold tracking-tight text-white mb-0.5 leading-snug">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs font-medium text-slate-200 leading-relaxed break-words">
                  {toast.message || toast.msg}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onClose && onClose(toast.id)}
                className="shrink-0 -mr-1 -mt-1 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Cerrar notificación"
                aria-label="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visual timer countdown bar */}
            {toast.duration > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 overflow-hidden">
                <div
                  className={`h-full ${barColor}`}
                  style={{
                    animation: `toast-progress ${toast.duration}ms linear forwards`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

