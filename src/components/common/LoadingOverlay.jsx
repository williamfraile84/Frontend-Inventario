import React from "react";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Layers,
  DollarSign,
  FileSearch,
  ShieldCheck,
  QrCode,
  FileCode,
} from "lucide-react";

export default function LoadingOverlay({
  isVisible,
  title = "Procesando Solicitud",
  message = "Conectando con el sistema...",
  submessage = "Por favor no cierre la ventana mientras se completa la operación.",
  iconType = "loader", // "loader", "search", "dollar", "layers", "sparkles", "shield", "qr", "document"
}) {
  if (!isVisible) return null;

  const renderIcon = () => {
    switch (iconType) {
      case "search":
        return <FileSearch className="w-8 h-8 text-emerald-400 animate-pulse" />;
      case "dollar":
        return <DollarSign className="w-8 h-8 text-emerald-400 animate-pulse" />;
      case "layers":
        return <Layers className="w-8 h-8 text-emerald-400 animate-pulse" />;
      case "sparkles":
        return <Sparkles className="w-8 h-8 text-amber-300 animate-pulse" />;
      case "shield":
        return <ShieldCheck className="w-8 h-8 text-blue-400 animate-pulse" />;
      case "qr":
        return <QrCode className="w-8 h-8 text-indigo-400 animate-pulse" />;
      case "document":
        return <FileCode className="w-8 h-8 text-teal-400 animate-pulse" />;
      default:
        return <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />;
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 animate-in fade-in duration-200 select-none"
    >
      {/* Resplandor ambiental de fondo */}
      <div className="absolute w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none -translate-y-4" />
      <div className="absolute w-60 h-60 bg-teal-500/10 rounded-full blur-2xl pointer-events-none translate-y-8" />

      {/* Tarjeta de estado Glassmorphism */}
      <div className="relative bg-slate-900/90 dark:bg-slate-900/95 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl shadow-emerald-950/30 border border-slate-700/80 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-200 text-slate-100">
        
        {/* Micro-badge de estado activo */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-[11px] font-semibold text-emerald-400 shadow-inner">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>OPERACIÓN EN CURSO</span>
        </div>

        {/* Anillo concéntrico central con brillo y spinner sincronizado */}
        <div className="relative">
          {/* Anillo exterior con resplandor */}
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500/20 via-slate-800/80 to-teal-500/20 p-[1.5px] shadow-lg shadow-emerald-500/10">
            <div className="w-full h-full bg-slate-900 rounded-3xl flex items-center justify-center border border-emerald-500/30">
              {renderIcon()}
            </div>
          </div>
          {/* Spinner orbital flotante */}
          <div className="absolute -top-1.5 -right-1.5 p-1 bg-slate-900 rounded-full border border-emerald-500/40 shadow-md">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
        </div>

        {/* Título y Mensaje descriptivo */}
        <div className="space-y-1.5 w-full">
          <h3 className="font-extrabold text-base sm:text-lg text-white flex items-center justify-center gap-2 tracking-tight">
            <span>{title}</span>
          </h3>
          <p className="text-xs sm:text-sm font-medium text-slate-300 break-words leading-relaxed px-1">
            {message}
          </p>
        </div>

        {/* Barra de progreso moderna con gradiente animado */}
        <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden shadow-inner p-[0.5px]">
          <div className="bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-500 h-full w-full rounded-full animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
        </div>

        {/* Submensaje de tranquilidad para el usuario */}
        {submessage && (
          <p className="text-[11px] text-slate-400 font-normal leading-snug">
            {submessage}
          </p>
        )}
      </div>
    </div>
  );
}
