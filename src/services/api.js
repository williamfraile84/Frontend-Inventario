import axios from "axios";
import { compressImageFile } from "../utils/imageCompressor";

// Permite configurar URL de backend independiente en la nube o proxy local de Vite
const getApiBase = () => {
  const envBase =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api`
      : "");

  if (typeof window !== "undefined" && window.location) {
    const isLocalBrowser =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    
    // Si estamos en localhost y no se especificó explícitamente forzar backend remoto
    // (VITE_FORCE_REMOTE_API="true"), usar siempre la ruta relativa "/api" que Vite redirige
    // al backend local (o que FastAPI sirve en modo integrado).
    const forceRemote = import.meta.env.VITE_FORCE_REMOTE_API === "true";
    if (isLocalBrowser && !forceRemote) {
      return "/api";
    }

    // Si estamos en un navegador en otro dispositivo (móvil, red local o túnel Cloudflare/Localtunnel)
    // pero el build tiene configurado "localhost" o "127.0.0.1", NO debemos intentar llamar al localhost
    // del móvil, sino usar la ruta relativa "/api" para comunicarse con el servidor que sirvió la app.
    if (
      !isLocalBrowser &&
      envBase &&
      (envBase.includes("localhost") || envBase.includes("127.0.0.1"))
    ) {
      return "/api";
    }
  }

  return envBase || "/api";
};

const API_BASE = getApiBase();

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
    "bypass-tunnel-reminder": "true",
    "tunnl-skip-browser-warning": "1",
  },
  timeout: 30000,
});

// Funciones auxiliares para manejo unificado de storage (localStorage vs sessionStorage)
const getToken = () =>
  localStorage.getItem("fruver_token") ||
  sessionStorage.getItem("fruver_token");

const getUserData = () =>
  localStorage.getItem("fruver_user_data") ||
  sessionStorage.getItem("fruver_user_data");

const clearAuthStorage = () => {
  localStorage.removeItem("fruver_token");
  sessionStorage.removeItem("fruver_token");
  localStorage.removeItem("fruver_user_data");
  sessionStorage.removeItem("fruver_user_data");
};

// Interceptor para agregar token JWT en cada petición
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Variables de resiliencia ante micro-cortes de red o túnel SSH
let consecutiveFailures = 0;
let isVerifyingHealth = false;

// Interceptor para manejar respuestas, caídas de servidor y expiración de sesión
api.interceptors.response.use(
  (response) => {
    consecutiveFailures = 0;
    if (window._app_is_server_down) {
      window._app_is_server_down = false;
      window.dispatchEvent(new CustomEvent("app_server_up"));
    }
    return response;
  },
  async (error) => {
    const config = error.config || {};
    const isNetworkError =
      !error.response ||
      error.code === "ERR_NETWORK" ||
      error.code === "ECONNREFUSED" ||
      error.message === "Network Error" ||
      error.code === "ECONNABORTED";
    const isServer5xx =
      error.response && [502, 503, 504].includes(error.response.status);

    // 1. Reintento automático transparente ante micro-cortes del túnel para peticiones GET
    if (
      (isNetworkError || isServer5xx) &&
      config.method === "get" &&
      !config._retryCount &&
      !config.isHealthProbe
    ) {
      config._retryCount = 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        return await api(config);
      } catch (retryErr) {
        error = retryErr;
      }
    }

    const isHealthCheck =
      config.url?.includes("/health") || config.isHealthProbe;
    const isBackgroundPoll =
      config.isBackgroundPoll ||
      config.url?.includes("/products/status") ||
      config.headers?.["X-Background-Poll"] === "true";

    // 2. Errores en background (polling de estado POS, etc.) NUNCA deben mostrar la pantalla roja de caída total
    if ((isNetworkError || isServer5xx) && !isHealthCheck && !isBackgroundPoll) {
      consecutiveFailures++;
      // Solo si fallan 2 o más peticiones consecutivas del usuario, verificar si el backend realmente cayó
      if (consecutiveFailures >= 2 && !isVerifyingHealth) {
        isVerifyingHealth = true;
        try {
          const isHealthy = await checkServerHealth(4000);
          if (!isHealthy) {
            window._app_is_server_down = true;
            window.dispatchEvent(
              new CustomEvent("app_server_down", {
                detail: {
                  status: error.response?.status || 0,
                  message: error.message || "Servidor inaccesible",
                },
              })
            );
          } else {
            consecutiveFailures = 0;
          }
        } finally {
          isVerifyingHealth = false;
        }
      }
    } else if (error.response && error.response.status === 401) {
      clearAuthStorage();
      window.dispatchEvent(new Event("auth_change"));
    }
    return Promise.reject(error);
  },
);

/**
 * Realiza un sondeo (ping) rápido al backend para comprobar si está en línea.
 */
export async function checkServerHealth(timeoutMs = 4000) {
  try {
    const healthUrl = API_BASE.endsWith("/api")
      ? `${API_BASE}/health`
      : `${API_BASE.replace(/\/$/, "")}/health`;
    await axios.get(healthUrl, {
      timeout: timeoutMs,
      isHealthProbe: true,
      headers: { "Cache-Control": "no-cache" },
    });
    window._app_is_server_down = false;
    window.dispatchEvent(new CustomEvent("app_server_up"));
    return true;
  } catch {
    return false;
  }
}

export const authService = {
  login: async (username, password, rememberMe = true) => {
    const res = await api.post("/auth/login-json", { username, password });
    if (res.data.access_token) {
      clearAuthStorage();
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("fruver_token", res.data.access_token);
      if (res.data.user) {
        storage.setItem("fruver_user_data", JSON.stringify(res.data.user));
      }
      window.dispatchEvent(new Event("auth_change"));
    }
    return res.data;
  },
  logout: () => {
    clearAuthStorage();
    window.dispatchEvent(new Event("auth_change"));
  },
  getCurrentUser: async () => {
    const res = await api.get("/auth/me");
    if (res.data) {
      const storage = localStorage.getItem("fruver_token")
        ? localStorage
        : sessionStorage;
      storage.setItem("fruver_user_data", JSON.stringify(res.data));
    }
    return res.data;
  },
  isLoggedIn: () => {
    return !!getToken();
  },
  getUser: () => {
    try {
      const raw = getUserData();
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignorar error de parsing si el almacenamiento está vacío o corrupto
    }
    return { username: "Usuario", role: "cajero", permissions: {} };
  },
  hasPermission: (permName) => {
    const user = authService.getUser();
    if (user.role === "admin") return true;
    return !!(user.permissions && user.permissions[permName]);
  },
};

// Caché local en memoria del frontend para lecturas repetidas instantáneas (0ms)
const clientCache = new Map();
const CLIENT_CACHE_TTL = 60000; // 60 segundos

export const productService = {
  list: async (params = {}) => {
    return catalogService.getProducts(params);
  },
  getProducts: async (params = {}) => {
    return catalogService.getProducts(params);
  },
  search: async (query = "") => {
    return productService.searchProducts(query);
  },
  getPosStatus: async () => {
    const res = await api.get("/products/status", {
      isBackgroundPoll: true,
      headers: { "X-Background-Poll": "true" },
    });
    return res.data;
  },
  lookupProduct: async (barcode) => {
    const clean = String(barcode || "").trim();
    if (!clean)
      return { found: false, barcode: clean, message: "Código vacío" };

    const cached = clientCache.get(clean);
    if (cached && Date.now() - cached.time < CLIENT_CACHE_TTL) {
      return cached.data;
    }

    const res = await api.get("/products/lookup", {
      params: { barcode: clean },
    });

    if (res.data && res.data.found) {
      clientCache.set(clean, { data: res.data, time: Date.now() });
      if (res.data.modal_barcode && res.data.modal_barcode !== clean) {
        clientCache.set(res.data.modal_barcode, {
          data: res.data,
          time: Date.now(),
        });
      }
    }
    return res.data;
  },
  searchProducts: async (query = "") => {
    const res = await api.get("/products/search", {
      params: { query },
    });
    return res.data;
  },
  getPosItemDetails: async (itemId) => {
    const res = await api.get(`/products/csopos/${itemId}`);
    return res.data;
  },
  updateSinglePrice: async ({
    barcode,
    newPrice,
    itemId = null,
    modalBarcode = null,
    itemName = null,
    oldPrice = null,
  }) => {
    const res = await api.post("/products/update-price", {
      barcode,
      modal_barcode: modalBarcode || barcode,
      new_price: parseFloat(newPrice),
      item_id: itemId,
      item_name: itemName,
      old_price: oldPrice !== null ? parseFloat(oldPrice) : null,
    });
    // Invalidar caché local
    clientCache.clear();
    return res.data;
  },
  bulkUpdatePrices: async (itemIds, newPrice, details = null) => {
    const res = await api.post("/products/bulk-update-prices", {
      item_ids: itemIds,
      new_price: parseFloat(newPrice),
      details,
    });
    // Invalidar caché local
    clientCache.clear();
    return res.data;
  },
  clearCache: () => {
    clientCache.clear();
  },
};

export const adminService = {
  getUsers: async () => {
    const res = await api.get("/admin/users");
    return res.data;
  },
  createUser: async (userData) => {
    const res = await api.post("/admin/users", userData);
    return res.data;
  },
  updateUser: async (userId, userData) => {
    const res = await api.put(`/admin/users/${userId}`, userData);
    return res.data;
  },
  deleteUser: async (userId) => {
    const res = await api.delete(`/admin/users/${userId}`);
    return res.data;
  },
  resetPassword: async (userId, newPassword) => {
    const res = await api.post(`/admin/users/${userId}/reset-password`, {
      new_password: newPassword,
    });
    return res.data;
  },
  getAuditLogs: async (limit = 100, offset = 0) => {
    const res = await api.get("/admin/audit-logs", {
      params: { limit, offset },
    });
    return res.data;
  },
  getSystemAuditLogs: async ({ modulo, accion, search, limit = 100, offset = 0 } = {}) => {
    const res = await api.get("/auditoria", {
      params: { modulo, accion, search, limit, offset },
    });
    return res.data;
  },
  exportSystemAuditCsv: async (params = {}) => {
    const res = await api.get("/auditoria/export-csv", {
      params,
      responseType: "blob",
    });
    return res.data;
  },
};

export const catalogService = {
  getProducts: async ({
    query = "",
    category = "",
    limit = 100,
    offset = 0,
  } = {}) => {
    const res = await api.get("/catalog/products", {
      params: {
        query: query || undefined,
        category: category || undefined,
        limit,
        offset,
      },
    });
    return res.data;
  },
  getProduct: async (id) => {
    const res = await api.get(`/catalog/products/${id}`);
    return res.data;
  },
  createProduct: async (productData) => {
    const res = await api.post("/catalog/products", productData);
    clientCache.clear();
    return res.data;
  },
  updateProduct: async (id, productData) => {
    const res = await api.put(`/catalog/products/${id}`, productData);
    clientCache.clear();
    return res.data;
  },
  checkBarcode: async (barcode, excludeId = null) => {
    const res = await api.get("/catalog/check-barcode", {
      params: { barcode, exclude_id: excludeId || undefined },
    });
    return res.data;
  },
  getUnits: async () => {
    const res = await api.get("/catalog/units");
    return res.data;
  },
  getDianUnits: async (query = "", limit = 50) => {
    const res = await api.get("/catalog/dian-units", { params: { query, limit } });
    return res.data;
  },
  convertDianUnits: async (payload) => {
    const res = await api.post("/catalog/dian-units/convert", payload);
    return res.data;
  },
  createUnit: async (unitData) => {
    const res = await api.post("/catalog/units", unitData);
    return res.data;
  },
  getCategories: async () => {
    const res = await api.get("/catalog/categories");
    return res.data;
  },
  getPackagingTypes: async () => {
    const res = await api.get("/catalog/packaging-types");
    return res.data;
  },
  createPackagingType: async (payload) => {
    const res = await api.post("/catalog/packaging-types", payload);
    return res.data;
  },
  getExpenseConcepts: async () => {
    const res = await api.get("/catalog/expense-concepts");
    return res.data;
  },
  createExpenseConcept: async (payload) => {
    const res = await api.post("/catalog/expense-concepts", payload);
    return res.data;
  },
  getDepartments: async () => {
    const res = await api.get("/catalog/departments");
    return res.data;
  },
  getCategoriesByDepartment: async (departmentCode) => {
    const res = await api.get("/catalog/categories-by-department", {
      params: { department_code: departmentCode },
    });
    return res.data;
  },
  searchCategories: async (term) => {
    const res = await api.get("/catalog/search-categories", {
      params: { term },
    });
    return res.data;
  },
  resyncProduct: async (productId) => {
    const res = await api.post(`/catalog/products/${productId}/resync-pos`);
    return res.data;
  },
};

export const invoiceService = {
  processImage: async (file, options = {}) => {
    // 1. Optimización y compresión previa de imagen en cliente (reduce fotos móviles de 10MB a <800KB)
    let processedFile = file;
    try {
      processedFile = await compressImageFile(file, {
        maxDimension: 1920,
        quality: 0.85,
        maxSizeMB: 1.0,
      });
    } catch {
      processedFile = file;
    }

    const formData = new FormData();
    formData.append("file", processedFile);
    const params = {
      // Activo por defecto para garantizar que túneles SSH remotos (tunnl.gg) con límite de 30s nunca sufran 502
      async_mode: options.async_mode !== undefined ? options.async_mode : true,
    };
    if (options.provider) {
      params.provider = options.provider;
    }
    if (options.nit) {
      params.nit = options.nit;
    }
    if (options.rotation) {
      params.rotation = options.rotation;
    }
    const res = await api.post("/invoices/process-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      params,
      timeout: options.timeout || 120000,
      signal: options.signal,
    });

    // Si el backend responde con tarea asíncrona (desacople para evitar timeout de 30s en túneles SSH como tunnl.gg)
    if (res.data?.async_task && res.data?.task_id) {
      const taskId = res.data.task_id;
      const startTime = Date.now();
      const maxWaitMs = 180000; // 3 minutos de tiempo máximo

      while (Date.now() - startTime < maxWaitMs) {
        if (options.signal?.aborted) {
          throw new Error("Procesamiento cancelado por el usuario.");
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));

        try {
          const pollRes = await api.get(`/invoices/task-status/${taskId}`, {
            signal: options.signal,
            timeout: 15000,
            headers: { "X-Background-Poll": "true" },
            isBackgroundPoll: true,
          });

          if (pollRes.data?.status === "completed") {
            return pollRes.data.result;
          }
          if (pollRes.data?.status === "error") {
            throw new Error(pollRes.data.error || "Error durante el procesamiento neuronal.");
          }
          if (typeof options.onProgress === "function" && pollRes.data?.message) {
            options.onProgress(pollRes.data.message);
          }
        } catch (pollErr) {
          if (pollErr?.name === "CanceledError" || options.signal?.aborted) {
            throw new Error("Procesamiento cancelado.");
          }
          // Micro-reintento ante fluctuaciones de red sin mostrar pantalla de caída
        }
      }
      throw new Error("El procesamiento de la factura excedió el tiempo límite.");
    }

    return res.data;
  },
  scanQr: async (file, options = {}) => {
    // Optimización de imagen para decodificación QR:
    // Solo comprimir si el archivo excede 3MB para evitar artefactos en códigos QR de alta densidad
    let processedFile = file;
    try {
      if (file && file.size > 3 * 1024 * 1024) {
        processedFile = await compressImageFile(file, {
          maxDimension: 1920,
          quality: 0.92,
          maxSizeMB: 1.5,
        });
      }
    } catch {
      processedFile = file;
    }

    const formData = new FormData();
    formData.append("file", processedFile);
    const headers = { "Content-Type": "multipart/form-data" };
    if (options.isBackgroundPoll) {
      headers["X-Background-Poll"] = "true";
    }
    const res = await api.post("/invoices/scan-qr", formData, {
      headers,
      params: {
        allow_ocr: options.allowOcr !== false ? "true" : "false",
      },
      timeout: options.timeout || 30000,
      signal: options.signal,
      isBackgroundPoll: Boolean(options.isBackgroundPoll),
    });
    return res.data;
  },
  consultDian: async ({ documentKey, nit }, options = {}) => {
    const res = await api.post("/invoices/consult-dian", {
      document_key: documentKey,
      nit: nit || undefined,
    }, {
      params: { async_mode: true },
      timeout: options.timeout || 120000,
      signal: options.signal,
    });

    // Desacople asíncrono para evitar timeouts de 30s en túneles SSH remotos (tunnl.gg)
    if (res.data?.async_task && res.data?.task_id) {
      const taskId = res.data.task_id;
      const startTime = Date.now();
      const maxWaitMs = 120000;

      while (Date.now() - startTime < maxWaitMs) {
        if (options.signal?.aborted) {
          throw new Error("Consulta cancelada por el usuario.");
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));

        try {
          const pollRes = await api.get(`/invoices/task-status/${taskId}`, {
            signal: options.signal,
            timeout: 15000,
            headers: { "X-Background-Poll": "true" },
            isBackgroundPoll: true,
          });

          if (pollRes.data?.status === "completed") {
            return pollRes.data.result;
          }
          if (pollRes.data?.status === "error") {
            throw new Error(pollRes.data.error || "Error consultando documento en DIAN.");
          }
          if (typeof options.onProgress === "function" && pollRes.data?.message) {
            options.onProgress(pollRes.data.message);
          }
        } catch (pollErr) {
          if (pollErr?.name === "CanceledError" || options.signal?.aborted) {
            throw new Error("Consulta cancelada.");
          }
        }
      }
      throw new Error("La consulta en la DIAN excedió el tiempo límite.");
    }

    return res.data;
  },
  calculateCosts: async (items, baseRedondeo = 100) => {
    const res = await api.post("/invoices/calculate-costs", {
      items,
      base_redondeo: baseRedondeo,
    });
    return res.data;
  },
  applyToInventory: async (payload) => {
    const res = await api.post("/invoices/apply-to-inventory", payload);
    clientCache.clear();
    return res.data;
  },
  getHistory: async (limit = 50, offset = 0) => {
    const res = await api.get("/invoices/history", {
      params: { limit, offset },
    });
    return res.data;
  },
  getInvoiceDetail: async (id) => {
    const res = await api.get(`/invoices/${id}`);
    return res.data;
  },
  exportPdf: async (id, invoiceNumber = "") => {
    const res = await api.get(`/invoices/${id}/export-pdf`, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `factura_${invoiceNumber || id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  exportExcel: async (id, invoiceNumber = "") => {
    const res = await api.get(`/invoices/${id}/export-excel`, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `factura_${invoiceNumber || id}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  learnInvoiceFeedback: async (payload) => {
    const res = await api.post("/invoices/learn", payload);
    return res.data;
  },
  getLearningStats: async () => {
    const res = await api.get("/invoices/learning-stats");
    return res.data;
  },
};

export function redondearCentenaCercana(valor, base = 100) {
  if (!valor || valor <= 0) return 0;
  return Math.floor(Number(valor) / base + 0.5) * base;
}
