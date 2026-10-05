import React, { useState, useEffect, useCallback } from "react";
import {
  ServerOff,
  RefreshCw,
  ShieldCheck,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { checkServerHealth } from "../../services/api";

export default function ServerDownView({ onReconnected }) {
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [lastCheckFailed, setLastCheckFailed] = useState(false);

  const probarConexion = useCallback(async () => {
    setChecking(true);
    setLastCheckFailed(false);
    const isOnline = await checkServerHealth(3500);
    setChecking(false);
    if (isOnline) {
      if (onReconnected) onReconnected();
    } else {
      setLastCheckFailed(true);
      setCountdown(5);
    }
  }, [onReconnected]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          probarConexion();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [probarConexion]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-xl bg-slate-900/90 backdrop-blur-xl border border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-red-950/80 border-2 border-red-500/40 flex items-center justify-center text-red-400 shadow-lg shadow-red-950/50 animate-pulse">
              <ServerOff className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-slate-900" />
            </span>
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
              <Activity className="w-3 h-3 animate-spin" /> Conexión con Backend Interrumpida
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Servidor No Disponible
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            No se pudo establecer comunicación con el{" "}
            <code className="text-amber-300 font-mono bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700">
              Servicio Backend
            </code>
            . El sistema está reintentando la conexión de forma automática (ideal si el servicio gratuito de Render está despertando).
          </p>
        </div>

        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3 text-left">
          <div className="p-2 rounded-xl bg-emerald-900/50 text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-black text-emerald-300 uppercase tracking-wide">
              Tus Datos Están Protegidos
            </h4>
            <p className="text-[11px] text-slate-300 leading-normal">
              La información de tu sesión está resguardada localmente. Tan pronto el backend vuelva a estar en línea, todo continuará sin pérdida de datos.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={probarConexion}
            disabled={checking}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-black text-xs sm:text-sm py-3.5 px-5 rounded-2xl transition flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
            <span>
              {checking
                ? "Comprobando conexión..."
                : `Reintentar ahora (${countdown}s)`}
            </span>
          </button>

          {lastCheckFailed && (
            <div className="flex items-center justify-center gap-2 text-xs text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>El servidor aún no responde. Esperando próximo reintento...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
