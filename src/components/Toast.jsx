import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import ToastNotification from "./common/ToastNotification";

export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;
  return <ToastNotification toasts={toasts} onClose={removeToast} />;
}

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
      {toasts.map((toast) => {
        let bgColor = "bg-slate-900 border-slate-700 text-slate-100";
        let Icon = Info;
        let iconColor = "text-blue-400";

        if (toast.type === "success") {
          bgColor =
            "bg-emerald-950/90 border-emerald-500/50 text-emerald-100 shadow-emerald-900/20";
          Icon = CheckCircle2;
          iconColor = "text-emerald-400";
        } else if (toast.type === "error") {
          bgColor =
            "bg-rose-950/90 border-rose-500/50 text-rose-100 shadow-rose-900/20";
          Icon = XCircle;
          iconColor = "text-rose-400";
        } else if (toast.type === "warning") {
          bgColor =
            "bg-amber-950/90 border-amber-500/50 text-amber-100 shadow-amber-900/20";
          Icon = AlertTriangle;
          iconColor = "text-amber-400";
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${bgColor}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 text-sm font-medium">
              {toast.title && (
                <div className="font-bold text-base mb-0.5">{toast.title}</div>
              )}
              <div>{toast.message}</div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-lg hover:bg-white/10 transition text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
export { ToastNotification };
