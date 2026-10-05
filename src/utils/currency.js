/**
 * Formateador de moneda colombiana (COP) y números contables.
 * Alineado con las convenciones de sistema_fruver_actual.
 */

/**
 * Formatea valores numéricos o strings a formato moneda colombiana sin decimales.
 * Ej: 150000 -> "$ 150.000" o "$150.000"
 */
export const formatCurrency = (val, includeSpace = true) => {
  const num = Math.round(Number(val) || 0);
  const prefix = includeSpace ? "$ " : "$";
  return prefix + num.toLocaleString("es-CO");
};

/**
 * Formatea valores para inputs numéricos con separador de miles.
 */
export const formatMoney = (val) => {
  if (
    val === null ||
    val === undefined ||
    val === "" ||
    val === 0 ||
    val === "0"
  ) {
    return "";
  }
  const num = parseInt(val.toString().replace(/\D/g, ""), 10);
  return isNaN(num) || num === 0 ? "" : num.toLocaleString("es-CO");
};

/**
 * Convierte texto con puntos de miles o comas a número entero real en pesos colombianos.
 * Ej: "150.000" -> 150000, "$ 150.000" -> 150000
 */
export const parseMoney = (val) => {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.round(val);
  const cleaned = val.toString().replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
};

/**
 * Formatea NITs estándar colombianos añadiendo guión al dígito de verificación si tiene 10 dígitos.
 */
export const formatNit = (val) => {
  if (!val) return "";
  const raw = val.replace(/\D/g, "");
  if (raw.length === 10) {
    return `${raw.slice(0, 9)}-${raw.slice(9)}`;
  }
  return val;
};
