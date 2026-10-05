import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect
} from "react";
import ToastNotification from "../components/common/ToastNotification";

const ToastContext = createContext(null);

function playNotificationChime(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === "error") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4
      osc.frequency.linearRampToValueAtTime(220.00, ctx.currentTime + 0.15); // A3
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === "warning") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(493.88, ctx.currentTime + 0.08); // B4
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    // Audio contexts might be blocked before first user gesture, fail silently
  }
}

export function ToastProvider({ children, enableAudio = true }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const hideToast = useCallback(() => {
    // Dismiss the most recent toast or all
    setToasts((prev) => {
      if (prev.length === 0) return prev;
      const lastId = prev[prev.length - 1].id;
      if (timersRef.current.has(lastId)) {
        clearTimeout(timersRef.current.get(lastId));
        timersRef.current.delete(lastId);
      }
      return prev.slice(0, -1);
    });
  }, []);

  const showToast = useCallback(
    (msgOrOptions, type = "info", duration = 4000) => {
      let id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      let toastType = type;
      let toastTitle = "";
      let toastMessage = "";
      let toastDuration = duration;
      let playSound = enableAudio;

      if (typeof msgOrOptions === "object" && msgOrOptions !== null) {
        toastType = msgOrOptions.type || "info";
        toastTitle = msgOrOptions.title || "";
        toastMessage = msgOrOptions.message || msgOrOptions.msg || "";
        toastDuration = msgOrOptions.duration !== undefined ? msgOrOptions.duration : 4000;
        if (msgOrOptions.sound !== undefined) playSound = msgOrOptions.sound;
      } else {
        toastMessage = String(msgOrOptions || "");
      }

      if (playSound) {
        playNotificationChime(toastType);
      }

      const newToast = {
        id,
        type: toastType,
        title: toastTitle,
        message: toastMessage,
        duration: toastDuration,
        createdAt: Date.now()
      };

      // Cap visible toasts at 4 to prevent clutter
      setToasts((prev) => [...prev.slice(-3), newToast]);

      if (toastDuration > 0) {
        const timer = setTimeout(() => {
          removeToast(id);
        }, toastDuration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [enableAudio, removeToast]
  );

  // Helper bindings
  Object.assign(showToast, {
    success: (msg, title = "", dur = 3500) => showToast({ type: "success", title, message: msg, duration: dur }),
    error: (msg, title = "", dur = 5000) => showToast({ type: "error", title, message: msg, duration: dur }),
    warning: (msg, title = "", dur = 4000) => showToast({ type: "warning", title, message: msg, duration: dur }),
    info: (msg, title = "", dur = 3500) => showToast({ type: "info", title, message: msg, duration: dur }),
  });

  useEffect(() => {
    const currentTimers = timersRef.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        addToast: showToast, // Alias for backward compatibility
        hideToast,
        removeToast,
        toasts
      }}
    >
      {children}
      <ToastNotification toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe ser utilizado dentro de un ToastProvider");
  }
  return context;
};

