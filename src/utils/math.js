/**
 * Motor de cálculos financieros, porcentajes y redondeo de precios.
 * Alineado exactamente con el estándar comercial de sistema_fruver_actual:
 * - Redondeo a centenas ($100): 251 -> 300, 249 -> 200, 250 -> 300.
 * - Cálculos de margen de utilidad (%) y markup.
 * - Ajustes porcentuales masivos e individuales.
 */

export const DEFAULT_PROFIT_MARGIN =
  Number(import.meta?.env?.VITE_DEFAULT_PROFIT_MARGIN) || 30;

export const DEFAULT_ROUNDING_BASE =
  Number(import.meta?.env?.VITE_ROUNDING_BASE) || 100;

/**
 * Redondea estrictamente al múltiplo de base más cercano (por defecto $100 COP).
 */
export const redondearCentenaEstricta = (
  valor,
  base = DEFAULT_ROUNDING_BASE,
) => {
  if (!valor || isNaN(valor)) return 0;
  const num = parseFloat(valor);
  if (num <= 0) return 0;
  const factor = base || 100;
  return Math.round(num / factor) * factor;
};

export const redondearCentenaCercana = redondearCentenaEstricta;
export const redondearCentena = redondearCentenaEstricta;

/**
 * Calcula el precio de venta a partir del costo base y el porcentaje de margen deseado.
 * Permite redondear automáticamente a centenas ($100 COP).
 *
 * @param {number} costo - Costo unitario base.
 * @param {number} margenPct - Margen en % (ej. 30).
 * @param {boolean} redondear - Si se redondea a centenas.
 * @param {string} formula - "markup" (costo * (1 + %)) o "margen" (costo / (1 - %))
 */
export const calcularPrecioVenta = (
  costo,
  margenPct = DEFAULT_PROFIT_MARGIN,
  redondear = true,
  formula = "markup",
  base = DEFAULT_ROUNDING_BASE,
) => {
  const c = parseFloat(costo) || 0;
  const m = parseFloat(margenPct) || 0;
  if (c <= 0) return 0;

  let precioBruto = 0;
  if (formula === "margen" && m < 100) {
    precioBruto = c / (1 - m / 100);
  } else {
    precioBruto = c * (1 + m / 100);
  }

  return redondear
    ? redondearCentenaEstricta(precioBruto, base)
    : Math.round(precioBruto);
};

/**
 * Calcula el porcentaje de margen real obtenido dado el costo y el precio de venta.
 */
export const calcularMargen = (costo, precioVenta) => {
  const c = parseFloat(costo) || 0;
  const p = parseFloat(precioVenta) || 0;
  if (c <= 0 || p <= 0) return 0;
  return parseFloat((((p - c) / c) * 100).toFixed(1));
};

/**
 * Aplica un incremento o decremento porcentual a un precio dado.
 * Ej: 2500 con +10% -> 2750 -> redondeado a centenas: 2800.
 *
 * @param {number} precioActual - Precio original.
 * @param {number} deltaPct - Porcentaje a aplicar (+10, -5, etc.).
 * @param {boolean} redondear - Si se redondea a centenas.
 */
export const calcularAjustePorcentual = (
  precioActual,
  deltaPct,
  redondear = true,
  base = DEFAULT_ROUNDING_BASE,
) => {
  const p = parseFloat(precioActual) || 0;
  const d = parseFloat(deltaPct) || 0;
  if (p <= 0) return 0;

  const resultado = p * (1 + d / 100);
  const resultadoPositivo = Math.max(0, resultado);
  return redondear
    ? redondearCentenaEstricta(resultadoPositivo, base)
    : Math.round(resultadoPositivo);
};
