import { inflateRawSync } from 'node:zlib';

// Lecteur .xlsx minimal, sans dépendance externe : un fichier .xlsx est une archive ZIP
// contenant des documents XML (feuilles de calcul, table des chaînes partagées). On
// implémente ici juste assez du format ZIP (recherche de l'End Of Central Directory,
// lecture de la table centrale, décompression DEFLATE via node:zlib) et du XML des
// feuilles Excel pour en extraire des lignes exploitables par l'import.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buf) {
  const maxCommentLength = 65535;
  const searchStart = Math.max(0, buf.length - 22 - maxCommentLength);
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error("Archive ZIP invalide (fin de la table centrale introuvable)");
}

// Retourne une Map<nomDeFichier, Buffer décompressé> pour toutes les entrées de l'archive.
function unzipEntries(buf) {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let offset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error('Archive ZIP invalide (en-tête de table centrale inattendu)');
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraFieldLength = buf.readUInt16LE(offset + 30);
    const fileCommentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const fileName = buf.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    entries.set(fileName, { compressionMethod, compressedSize, localHeaderOffset });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  const result = new Map();
  for (const [fileName, meta] of entries) {
    const lh = meta.localHeaderOffset;
    if (buf.readUInt32LE(lh) !== LOCAL_HEADER_SIGNATURE) {
      throw new Error(`Archive ZIP invalide (en-tête local inattendu pour "${fileName}")`);
    }
    const lhFileNameLength = buf.readUInt16LE(lh + 26);
    const lhExtraFieldLength = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhFileNameLength + lhExtraFieldLength;
    const dataEnd = dataStart + meta.compressedSize;
    const raw = buf.subarray(dataStart, dataEnd);
    const data = meta.compressionMethod === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    result.set(fileName, data);
  }
  return result;
}

function unescapeXml(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

// xl/sharedStrings.xml : chaque <si> peut contenir un <t> direct ou plusieurs <r><t>...</t></r>
// (texte enrichi) — on concatène tous les <t> d'un même <si>.
function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let texte = '';
    let tm;
    while ((tm = tRegex.exec(m[1]))) texte += unescapeXml(tm[1]);
    strings.push(texte);
  }
  return strings;
}

// Convertit une référence de colonne ("A", "B", ..., "AA", ...) en index 0-based.
function colRefToIndex(ref) {
  const lettres = ref.match(/[A-Z]+/)[0];
  let index = 0;
  for (let i = 0; i < lettres.length; i++) {
    index = index * 26 + (lettres.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const cellRegex = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] || '';
      const refMatch = attrs.match(/r="([A-Z]+\d+)"/);
      if (!refMatch) continue;
      const colIndex = colRefToIndex(refMatch[1]);
      const typeMatch = attrs.match(/t="([a-zA-Z]+)"/);
      const type = typeMatch ? typeMatch[1] : 'n';

      let valeur = '';
      if (type === 'inlineStr') {
        const tMatch = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        valeur = tMatch ? unescapeXml(tMatch[1]) : '';
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const rawValue = vMatch ? vMatch[1] : '';
        if (type === 's') {
          const idx = Number(rawValue);
          valeur = Number.isInteger(idx) ? sharedStrings[idx] ?? '' : '';
        } else if (type === 'b') {
          valeur = rawValue === '1' ? 'oui' : 'non';
        } else {
          valeur = unescapeXml(rawValue);
        }
      }
      cells[colIndex] = valeur;
    }
    rows.push(cells);
  }
  return rows;
}

function firstWorksheetXml(entries) {
  if (entries.has('xl/worksheets/sheet1.xml')) return entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const feuilles = [...entries.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!feuilles.length) throw new Error("Aucune feuille de calcul trouvée dans le fichier Excel");
  return entries.get(feuilles[0]).toString('utf8');
}

// Parse un classeur .xlsx (Buffer) et retourne un tableau d'objets indexés sur la première
// ligne (en-têtes), dans le même format que parseCsv — la première feuille du classeur
// est utilisée, les cellules vides ou absentes valent ''.
export function parseXlsx(buffer) {
  let entries;
  try {
    entries = unzipEntries(buffer);
  } catch {
    throw new Error("Fichier Excel invalide ou non pris en charge (attendu : .xlsx). Le format .xls (Excel 97-2003) n'est pas supporté : enregistrez le fichier au format .xlsx ou .csv.");
  }

  const sharedStringsXml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const worksheetXml = firstWorksheetXml(entries);
  const rows = parseWorksheetRows(worksheetXml, sharedStrings);

  const rowsNonVides = rows.filter((r) => r.some((v) => v !== undefined && v !== ''));
  if (rowsNonVides.length === 0) return [];

  const headers = rowsNonVides[0].map((h) => (h ?? '').toString().trim());
  return rowsNonVides.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = r[idx] !== undefined && r[idx] !== null ? String(r[idx]).trim() : '';
    });
    return obj;
  });
}
