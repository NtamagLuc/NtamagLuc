import { parseXlsx } from './xlsx.js';
import { HttpError } from './miniweb.js';

// Point d'entrée commun aux routes d'import : accepte soit du CSV texte (req.body.csv),
// soit un classeur Excel encodé en base64 (req.body.xlsxBase64), et retourne dans les
// deux cas le même format de lignes (tableau d'objets indexés sur les en-têtes).
export function parseImportRows(body) {
  if (body?.xlsxBase64) {
    try {
      return parseXlsx(Buffer.from(body.xlsxBase64, 'base64'));
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  }
  return parseCsv(body?.csv);
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(','));
  return ['﻿' + header, ...lines].join('\r\n');
}

export function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(toCsv(rows, columns));
}

// Parseur CSV minimal (RFC4180) : gère les champs entre guillemets contenant virgules,
// guillemets échappés ("") et retours à la ligne. Retourne un tableau d'objets indexés
// sur la première ligne (en-têtes).
export function parseCsv(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() {
    row.push(field);
    field = '';
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const rowsNonVides = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (rowsNonVides.length === 0) return [];
  const headers = rowsNonVides[0].map((h) => h.trim());
  return rowsNonVides.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = r[idx] !== undefined ? r[idx].trim() : ''));
    return obj;
  });
}
