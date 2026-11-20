/**
 * Utilidades de manipulación, decodificación y normalización de texto.
 * Especializado para sanitizar respuestas y nombres de artículos provenientes del POS.
 */

/**
 * Decodifica entidades HTML (&Eacute;, &eacute;, &aacute;, &amp;, etc.) en texto legible.
 * Utiliza DOMParser en entornos con DOM y un mapa de fallback en entornos sin DOM.
 *
 * @param {string} text - Texto que puede contener entidades HTML.
 * @returns {string} Texto decodificado.
 */
export function decodeHtml(text) {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("&")) return text;
  
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const decoded = doc.body.textContent || "";
    // Manejar doble codificación (ej. &amp;Eacute;)
    if (decoded.includes("&")) {
      const doc2 = new DOMParser().parseFromString(decoded, "text/html");
      return doc2.body.textContent || decoded;
    }
    return decoded;
  } catch {
    return text
      .replace(/&Eacute;/g, "É")
      .replace(/&eacute;/g, "é")
      .replace(/&Aacute;/g, "Á")
      .replace(/&aacute;/g, "á")
      .replace(/&Iacute;/g, "Í")
      .replace(/&iacute;/g, "í")
      .replace(/&Oacute;/g, "Ó")
      .replace(/&oacute;/g, "ó")
      .replace(/&Uacute;/g, "Ú")
      .replace(/&uacute;/g, "ú")
      .replace(/&Ntilde;/g, "Ñ")
      .replace(/&ntilde;/g, "ñ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}

/**
 * Normaliza y remueve acentos o caracteres especiales para búsquedas insensibles.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeSearchText(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
