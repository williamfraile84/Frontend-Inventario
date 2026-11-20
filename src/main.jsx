import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Registro de Service Worker para PWA con recarga automática ante nuevas versiones
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Verificar actualizaciones inmediatamente al cargar la página
        reg.update();
      })
      .catch((err) => {
        console.warn("Aviso PWA: no se pudo registrar Service Worker:", err);
      });

    // Detectar si el Service Worker tomó el control tras una actualización real (no en primera instalación)
    let refreshing = false;
    const hadExistingController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing && hadExistingController) {
        refreshing = true;
        console.log("[PWA] Service Worker actualizado. Recargando para aplicar cambios...");
        window.location.reload();
      }
    });
  });
}
