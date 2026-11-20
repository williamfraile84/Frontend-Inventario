import React, { useState, useEffect } from "react";
import { Download, Check, RefreshCw } from "lucide-react";
import { useToast } from "../../context/ToastContext";

export default function PwaInstallButton({ onShowToast }) {
  let toastContext = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    toastContext = useToast();
  } catch {
    toastContext = null;
  }
  const notify = onShowToast || toastContext?.showToast;

  const [deferredPrompt, setDeferredPrompt] = useState(() => {
    return (typeof window !== "undefined" && window.__pwaInstallPrompt) || null;
  });
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // 1. Detectar si ya se está ejecutando como PWA instalada (Standalone)
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://");
    setIsStandalone(isRunningStandalone);

    // 2. Comprobar si ya está instalada en el sistema operativo mediante getInstalledRelatedApps
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then((apps) => {
        if (apps && apps.length > 0) {
          setIsStandalone(true);
        }
      }).catch(() => {});
    }

    // 3. Sincronizar prompt capturado tempranamente en index.html
    if (window.__pwaInstallPrompt) {
      setDeferredPrompt(window.__pwaInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.__pwaInstallPrompt = e;
      setDeferredPrompt(e);
    };

    const handlePromptAvailable = (e) => {
      if (e.detail) {
        setDeferredPrompt(e.detail);
      }
    };

    const handleAppInstalled = () => {
      window.__pwaInstallPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
      setIsInstalling(false);
      notify?.({
        type: "success",
        title: "¡PWA Instalada con Éxito!",
        message: "Fruver POS ya está disponible en tu escritorio o pantalla de inicio.",
      });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("pwa-prompt-available", handlePromptAvailable);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("pwa-app-installed", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("pwa-prompt-available", handlePromptAvailable);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("pwa-app-installed", handleAppInstalled);
    };
  }, [notify]);

  const handleInstallClick = async () => {
    let promptEvent =
      deferredPrompt ||
      (typeof window !== "undefined" ? window.__pwaInstallPrompt : null);

    // Si el prompt nativo está listo, invocarlo de inmediato
    if (promptEvent) {
      try {
        setIsInstalling(true);
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") {
          notify?.({
            type: "success",
            title: "Instalando Fruver POS...",
            message: "La aplicación se está agregando a tu equipo.",
          });
          setIsStandalone(true);
        }
        window.__pwaInstallPrompt = null;
        setDeferredPrompt(null);
      } catch (err) {
        console.warn("Fallo al disparar prompt de instalación:", err);
      } finally {
        setIsInstalling(false);
      }
      return;
    }

    // Si ya está instalada en el sistema
    if (isStandalone) {
      notify?.({
        type: "success",
        title: "Aplicación Ya Instalada",
        message: "Fruver POS ya se encuentra instalada en este equipo. Puedes abrirla desde tu escritorio.",
      });
      return;
    }

    // Si aún no ha llegado el evento del navegador, esperar activamente hasta 2 segundos
    setIsInstalling(true);
    const waitForPrompt = new Promise((resolve) => {
      const onAvailable = (e) => {
        window.removeEventListener("pwa-prompt-available", onAvailable);
        resolve(e.detail || window.__pwaInstallPrompt);
      };
      window.addEventListener("pwa-prompt-available", onAvailable);

      let timer = 0;
      const interval = setInterval(() => {
        timer += 100;
        const p = window.__pwaInstallPrompt;
        if (p) {
          clearInterval(interval);
          window.removeEventListener("pwa-prompt-available", onAvailable);
          resolve(p);
        } else if (timer >= 2000) {
          clearInterval(interval);
          window.removeEventListener("pwa-prompt-available", onAvailable);
          resolve(null);
        }
      }, 100);
    });

    const readyPrompt = await waitForPrompt;
    setIsInstalling(false);

    if (readyPrompt) {
      try {
        await readyPrompt.prompt();
        const choice = await readyPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
          notify?.({
            type: "success",
            title: "Instalando Fruver POS...",
            message: "La aplicación se está agregando a tu equipo.",
          });
          setIsStandalone(true);
        }
        window.__pwaInstallPrompt = null;
        setDeferredPrompt(null);
        return;
      } catch (e) {
        console.warn("Error en prompt esperado:", e);
      }
    }

    // Si el navegador ya tiene la app instalada o requiere confirmación desde la barra superior
    notify?.({
      type: "info",
      title: "Instalación de Fruver POS",
      message: "Para confirmar, pulsa el icono de instalación (⊞ o ⬇) situado a la derecha en la barra de direcciones de Chrome o Edge.",
    });
  };

  if (isStandalone) {
    return (
      <span
        className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0 select-none"
        title="Fruver POS está instalado y activo"
      >
        <Check className="w-3.5 h-3.5 text-emerald-500" />
        <span>PWA Instalada</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      disabled={isInstalling}
      className="btn-tactile pwa-install-btn flex items-center gap-1.5 px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 rounded-xl border border-emerald-300 dark:border-emerald-500/50 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition shadow-xs cursor-pointer shrink-0 disabled:opacity-75"
      title="Instalar Fruver POS directamente en tu equipo"
      aria-label="Instalar Fruver POS PWA"
    >
      {isInstalling ? (
        <RefreshCw className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
      )}
      <span className="hidden lg:inline text-emerald-800 dark:text-emerald-300">
        {isInstalling ? "Instalando..." : "Instalar App"}
      </span>
      <span className="hidden sm:inline lg:hidden text-emerald-800 dark:text-emerald-300">
        {isInstalling ? "Instalando..." : "Instalar"}
      </span>
    </button>
  );
}
