import axios from "axios";

// Permite configurar URL de backend independiente en la nube o proxy local de Vite
const API_BASE = import.meta.env.DEV
  ? "/api"
  : import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
    : import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api`
      : "/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
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

// Interceptor para manejar respuestas, caídas de servidor y expiración de sesión
api.interceptors.response.use(
  (response) => {
    if (window._app_is_server_down) {
      window._app_is_server_down = false;
      window.dispatchEvent(new CustomEvent("app_server_up"));
    }
    return response;
  },
  (error) => {
    const isNetworkError =
      !error.response ||
      error.code === "ERR_NETWORK" ||
      error.code === "ECONNREFUSED" ||
      error.message === "Network Error";
    const isServer5xx =
      error.response && [502, 503, 504].includes(error.response.status);

    if (isNetworkError || isServer5xx) {
      const isHealthCheck =
        error.config?.url?.includes("/health") || error.config?.isHealthProbe;
      if (!isHealthCheck) {
        window._app_is_server_down = true;
        window.dispatchEvent(
          new CustomEvent("app_server_down", {
            detail: {
              status: error.response?.status || 0,
              message: error.message || "Servidor inaccesible",
            },
          })
        );
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
    const rootUrl = API_BASE.endsWith("/api") ? API_BASE.slice(0, -4) : API_BASE;
    await axios.get(`${rootUrl}/health`, {
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
    } catch (e) {}
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
  getPosStatus: async () => {
    const res = await api.get("/products/status");
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
    const formData = new FormData();
    formData.append("file", file);
    const params = {};
    if (options.provider) {
      params.provider = options.provider;
    }
    const res = await api.post("/invoices/process-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      params,
      timeout: options.timeout || 120000,
      signal: options.signal,
    });
    return res.data;
  },
  scanQr: async (file, options = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/invoices/scan-qr", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: options.timeout || 30000,
      signal: options.signal,
    });
    return res.data;
  },
  consultDian: async ({ documentKey, nit }, options = {}) => {
    const res = await api.post("/invoices/consult-dian", {
      document_key: documentKey,
      nit: nit || undefined,
    }, {
      timeout: options.timeout || 60000,
      signal: options.signal,
    });
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
