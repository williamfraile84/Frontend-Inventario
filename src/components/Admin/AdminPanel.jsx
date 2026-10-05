import React, { useState, useEffect } from "react";
import {
  Users,
  Shield,
  History,
  UserPlus,
  Edit2,
  Trash2,
  Key,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Lock,
  Calendar,
  DollarSign,
  Tag,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Clock,
  User,
  Barcode,
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { adminService, authService } from "../../services/api";
import UserModal from "./UserModal";
import { useLoading } from "../../context/LoadingContext";
import { useToast } from "../../context/ToastContext";

export default function AdminPanel({ onShowToast }) {
  const { showLoader, hideLoader } = useLoading();
  const toast = useToast();
  const notify = (opts) => {
    if (typeof onShowToast === "function") {
      onShowToast(opts);
    } else {
      toast.showToast(opts);
    }
  };

  const [activeSubTab, setActiveSubTab] = useState("users"); // 'users' | 'audit'
  
  // Users state
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");

  const currentUser = authService.getUser();

  useEffect(() => {
    if (activeSubTab === "users") {
      fetchUsers(false);
    } else {
      fetchAuditLogs(false);
    }
  }, [activeSubTab]);

  const fetchUsers = async (showOverlay = true) => {
    setIsLoadingUsers(true);
    if (showOverlay) {
      showLoader({
        title: "Cargando Usuarios",
        message: "Consultando usuarios y permisos del sistema...",
        iconType: "loader",
      });
    }
    try {
      const data = await adminService.getUsers();
      setUsers(data || []);
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error de usuarios",
        message: err.response?.data?.detail || "No se pudo cargar la lista de usuarios.",
      });
    } finally {
      setIsLoadingUsers(false);
      if (showOverlay) hideLoader();
    }
  };

  const fetchAuditLogs = async (showOverlay = true) => {
    setIsLoadingLogs(true);
    if (showOverlay) {
      showLoader({
        title: "Cargando Auditoría",
        message: "Obteniendo registro histórico de precios...",
        iconType: "search",
      });
    }
    try {
      const data = await adminService.getAuditLogs(150);
      setAuditLogs(data || []);
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error de auditoría",
        message: err.response?.data?.detail || "No se pudo cargar el historial de cambios.",
      });
    } finally {
      setIsLoadingLogs(false);
      if (showOverlay) hideLoader();
    }
  };

  const handleOpenCreate = () => {
    setUserToEdit(null);
    setUserModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setUserToEdit(user);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (formData) => {
    setIsSavingUser(true);
    showLoader({
      title: userToEdit ? "Actualizando Usuario" : "Registrando Nuevo Usuario",
      message: `Guardando credenciales para '${formData.username}'...`,
      iconType: "sparkles",
    });
    try {
      if (userToEdit) {
        await adminService.updateUser(userToEdit.id, formData);
        notify({
          type: "success",
          title: "Usuario Actualizado",
          message: `El usuario '${formData.username}' fue actualizado correctamente.`,
        });
      } else {
        await adminService.createUser(formData);
        notify({
          type: "success",
          title: "Usuario Creado",
          message: `El usuario '${formData.username}' fue registrado exitosamente.`,
        });
      }
      setUserModalOpen(false);
      fetchUsers(false);
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error al guardar usuario",
        message: err.response?.data?.detail || "Ocurrió un error al procesar el usuario.",
      });
    } finally {
      setIsSavingUser(false);
      hideLoader();
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.username === "admin") {
      alert("No se puede eliminar el usuario administrador principal.");
      return;
    }
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente al usuario '${user.username}'?`)) {
      return;
    }

    showLoader({
      title: "Eliminando Usuario",
      message: `Eliminando cuenta de '${user.username}'...`,
      iconType: "loader",
    });
    try {
      await adminService.deleteUser(user.id);
      notify({
        type: "info",
        title: "Usuario Eliminado",
        message: `El usuario '${user.username}' ha sido eliminado del sistema.`,
      });
      fetchUsers(false);
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error al eliminar",
        message: err.response?.data?.detail || "No se pudo eliminar el usuario.",
      });
    } finally {
      hideLoader();
    }
  };

  const handleToggleActive = async (user) => {
    if (user.username === "admin") return;
    const nextState = !user.is_active;
    showLoader({
      title: "Actualizando Estado",
      message: `${nextState ? "Activando" : "Desactivando"} usuario '${user.username}'...`,
      iconType: "loader",
    });
    try {
      await adminService.updateUser(user.id, { is_active: nextState });
      notify({
        type: "success",
        title: nextState ? "Usuario Activado" : "Usuario Desactivado",
        message: `El estado de '${user.username}' ahora es ${nextState ? 'Activo' : 'Inactivo'}.`,
      });
      fetchUsers(false);
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error de estado",
        message: err.response?.data?.detail || "No se pudo cambiar el estado del usuario.",
      });
    } finally {
      hideLoader();
    }
  };

  const handleExportAuditCsv = () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      notify({
        type: "info",
        title: "Sin registros",
        message: "No hay registros de auditoría visibles para exportar.",
      });
      return;
    }

    showLoader({
      title: "Generando Reporte CSV",
      message: "Exportando historial de auditoría de precios...",
      iconType: "loader",
    });

    try {
      const headers = [
        "Fecha y Hora",
        "Usuario",
        "Tipo de Acción",
        "Código de Barras",
        "Producto",
        "Precio Anterior",
        "Precio Nuevo",
        "Diferencia",
        "Detalles",
      ];

      const rows = filteredLogs.map((log) => {
        const hasOld = log.old_price && log.old_price > 0;
        const diff = hasOld ? log.new_price - log.old_price : 0;
        return [
          `"${new Date(log.timestamp).toLocaleString("es-CO").replace(/"/g, '""')}"`,
          `"${(log.username || "").replace(/"/g, '""')}"`,
          `"${log.action_type === "bulk_update" ? "Masiva" : "Individual"}"`,
          `"${(log.barcode || "").replace(/"/g, '""')}"`,
          `"${(log.item_name || "").replace(/"/g, '""')}"`,
          hasOld ? log.old_price : "",
          log.new_price,
          hasOld ? diff : "",
          `"${(log.details || "").replace(/"/g, '""')}"`,
        ].join(",");
      });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      link.setAttribute("href", url);
      link.setAttribute("download", `auditoria_precios_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notify({
        type: "success",
        title: "Exportación Exitosa",
        message: `Se descargó el reporte con ${filteredLogs.length} registros.`,
      });
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error de Exportación",
        message: "No se pudo generar el archivo CSV.",
      });
    } finally {
      hideLoader();
    }
  };

  const handleExportSystemAuditCsv = async () => {
    showLoader({
      title: "Exportando Auditoría Global",
      message: "Consultando registros del sistema desde el servidor...",
      iconType: "loader",
    });
    try {
      const blob = await adminService.exportSystemAuditCsv();
      const url = URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      link.setAttribute("href", url);
      link.setAttribute("download", `auditoria_sistema_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notify({
        type: "success",
        title: "Exportación Exitosa",
        message: "Reporte de auditoría global descargado con éxito.",
      });
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error al exportar",
        message: "No se pudo obtener el reporte global del servidor.",
      });
    } finally {
      hideLoader();
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const filteredLogs = auditLogs.filter((l) => {
    const q = auditSearch.toLowerCase();
    return (
      l.username.toLowerCase().includes(q) ||
      l.barcode.toLowerCase().includes(q) ||
      (l.item_name && l.item_name.toLowerCase().includes(q)) ||
      l.action_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner with Sub-Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Panel de Administración
              </h2>
              <p className="text-xs text-slate-400">
                Gestión de usuarios, permisos del sistema y registro de auditoría de precios
              </p>
            </div>
          </div>

          {/* Sub Tab Switcher */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveSubTab("users")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                activeSubTab === "users"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuarios ({users.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab("audit")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                activeSubTab === "audit"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Auditoría de Precios</span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: GESTIÓN DE USUARIOS */}
      {activeSubTab === "users" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por usuario, nombre o rol..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={fetchUsers}
                onClick={() => fetchUsers(true)}
                disabled={isLoadingUsers}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
                title="Refrescar lista"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? "animate-spin" : ""}`} />
                <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? "animate-spin text-purple-400" : ""}`} />
              </button>

              <button
                onClick={handleOpenCreate}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>Nuevo Usuario</span>
              </button>
            </div>
          </div>

          {/* Users Table / Mobile Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Usuario / Nombre</th>
                    <th className="px-5 py-3.5">Rol</th>
                    <th className="px-5 py-3.5">Permisos Activos</th>
                    <th className="px-5 py-3.5">Estado</th>
                    <th className="px-5 py-3.5">Último Acceso</th>
                    <th className="px-5 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-4">
                        <div className="font-bold text-white text-sm">{u.full_name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">@{u.username}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            u.role === "admin"
                              ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                              : u.role === "supervisor"
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {u.permissions?.can_lookup && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                              Consulta
                            </span>
                          )}
                          {u.permissions?.can_edit_single && (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-[10px] text-emerald-300 border border-emerald-800/50">
                              Precio Ind.
                            </span>
                          )}
                          {u.permissions?.can_edit_bulk && (
                            <span className="px-2 py-0.5 rounded bg-blue-950/50 text-[10px] text-blue-300 border border-blue-800/50">
                              Masiva
                            </span>
                          )}
                          {u.permissions?.can_manage_users && (
                            <span className="px-2 py-0.5 rounded bg-purple-950/50 text-[10px] text-purple-300 border border-purple-800/50">
                              Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={u.username === "admin"}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            u.is_active
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30"
                          } transition disabled:cursor-not-allowed`}
                        >
                          {u.is_active ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Activo</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-rose-400" />
                              <span>Inactivo</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-xs">
                        {u.last_login ? new Date(u.last_login).toLocaleString("es-CO") : "Nunca"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-purple-900/40 text-slate-300 hover:text-purple-300 border border-slate-700 transition"
                            title="Editar usuario"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {u.username !== "admin" && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 transition"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-500 text-xs">
                        No se encontraron usuarios coincidentes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Cards View */}
            <div className="block lg:hidden divide-y divide-slate-800">
              {filteredUsers.map((u) => (
                <div key={u.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">{u.full_name}</h4>
                      <p className="text-xs text-slate-400 font-mono">@{u.username}</p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        u.role === "admin"
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                          : u.role === "supervisor"
                          ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>

                  {/* Permissions Chips */}
                  <div className="flex flex-wrap gap-1">
                    {u.permissions?.can_lookup && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                        Consulta
                      </span>
                    )}
                    {u.permissions?.can_edit_single && (
                      <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-[10px] text-emerald-300 border border-emerald-800/50">
                        Precio Ind.
                      </span>
                    )}
                    {u.permissions?.can_edit_bulk && (
                      <span className="px-2 py-0.5 rounded bg-blue-950/50 text-[10px] text-blue-300 border border-blue-800/50">
                        Edición Masiva
                      </span>
                    )}
                    {u.permissions?.can_manage_users && (
                      <span className="px-2 py-0.5 rounded bg-purple-950/50 text-[10px] text-purple-300 border border-purple-800/50">
                        Admin
                      </span>
                    )}
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.username === "admin"}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        u.is_active
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {u.is_active ? "Activo" : "Inactivo"}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(u)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-purple-900/30"
                      >
                        Editar
                      </button>
                      {u.username !== "admin" && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-900/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: REGISTRO DE AUDITORÍA 100% RESPONSIVE */}
      {activeSubTab === "audit" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por usuario, código o producto..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <button
              onClick={fetchAuditLogs}
              disabled={isLoadingLogs}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition self-end sm:self-auto flex items-center gap-2 text-xs font-semibold"
              title="Refrescar auditoría"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? "animate-spin" : ""}`} />
              <span className="sm:hidden">Actualizar</span>
            </button>
            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
              <button
                onClick={handleExportAuditCsv}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-200 transition flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                title="Descargar reporte de modificaciones de precios (CSV)"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exportar Precios</span>
              </button>

              <button
                onClick={handleExportSystemAuditCsv}
                className="px-3 py-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/50 text-purple-200 transition flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                title="Exportar toda la trazabilidad inmutable del sistema (CSV)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
                <span>Auditoría Global</span>
              </button>

              <button
                onClick={() => fetchAuditLogs(true)}
                disabled={isLoadingLogs}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition flex items-center gap-2 text-xs font-semibold"
                title="Refrescar auditoría"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? "animate-spin text-purple-400" : ""}`} />
                <span className="sm:hidden">Actualizar</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* 1. VISTA DE TABLA PARA PANTALLAS GRANDES (DESKTOP & TV) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Fecha y Hora</th>
                    <th className="px-5 py-3.5">Usuario</th>
                    <th className="px-5 py-3.5">Tipo</th>
                    <th className="px-5 py-3.5">Producto / Código</th>
                    <th className="px-5 py-3.5">Precio Nuevo</th>
                    <th className="px-5 py-3.5">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{new Date(log.timestamp).toLocaleString("es-CO")}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-bold text-white">@{log.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            log.action_type === "bulk_update"
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          {log.action_type === "bulk_update" ? "Masiva" : "Individual"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-white text-sm">{log.item_name || log.barcode}</div>
                        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                          <Barcode className="w-3 h-3" />
                          <span>{log.barcode}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-emerald-400 font-black font-mono text-sm">
                          {log.formatted_new_price}
                        </span>
                        {log.old_price && log.old_price > 0 && (
                          <div className="text-[10px] text-slate-400 font-mono line-through">
                            Antes: ${Number(log.old_price).toLocaleString("es-CO")}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs max-w-xs truncate">
                        {log.details || "-"}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-10 text-slate-500 text-xs">
                        No hay registros de modificaciones de precios que coincidan con la búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 2. VISTA DE TARJETAS FLUIDAS PARA PANTALLAS PEQUEÑAS Y MEDIANAS (MÓVILES Y TABLETS) */}
            <div className="block lg:hidden divide-y divide-slate-800">
              {filteredLogs.map((log) => {
                const isBulk = log.action_type === "bulk_update";
                const hasOldPrice = log.old_price && log.old_price > 0;
                const diff = hasOldPrice ? log.new_price - log.old_price : 0;

                return (
                  <div key={log.id} className="p-4 space-y-3 hover:bg-slate-800/20 transition">
                    {/* Header: Fecha y Tipo */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{new Date(log.timestamp).toLocaleString("es-CO")}</span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          isBulk
                            ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        }`}
                      >
                        {isBulk ? "Edición Masiva" : "Individual"}
                      </span>
                    </div>

                    {/* Producto y Usuario */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-white text-sm sm:text-base leading-snug">
                          {log.item_name || log.barcode}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-1">
                          <span className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            <Barcode className="w-3 h-3 text-slate-500" />
                            {log.barcode}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 bg-purple-950/40 border border-purple-800/50 px-2.5 py-1 rounded-lg shrink-0">
                        <User className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs font-bold text-purple-200 font-mono">
                          @{log.username}
                        </span>
                      </div>
                    </div>

                    {/* Price Banner Comparativo */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          Nuevo Precio
                        </span>
                        <span className="text-lg font-black text-emerald-400 font-mono">
                          {log.formatted_new_price}
                        </span>
                      </div>

                      {hasOldPrice && (
                        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                          <div className="flex flex-col text-right">
                            <span className="text-[9px] uppercase font-semibold text-slate-500">
                              Anterior
                            </span>
                            <span className="text-xs font-mono text-slate-400 line-through">
                              ${Number(log.old_price).toLocaleString("es-CO")}
                            </span>
                          </div>

                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />

                          {diff !== 0 && (
                            <span
                              className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                diff > 0
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-amber-500/20 text-amber-400"
                              }`}
                            >
                              {diff > 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Detalles Adicionales */}
                    {log.details && (
                      <div className="text-xs text-slate-400 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60 flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{log.details}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredLogs.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No hay registros de modificaciones de precios que coincidan con la búsqueda.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      <UserModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        onSave={handleSaveUser}
        userToEdit={userToEdit}
        isSaving={isSavingUser}
      />
    </div>
  );
}
