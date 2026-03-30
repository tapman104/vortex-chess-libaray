const PGN_RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function normalizeFormat(format, numPlayers) {
  if (format === '4player' || format === 'verbose' || format === 'standard') {
    return format;
  }
  return numPlayers === 4 ? '4player' : 'standard';
}

function defaultHeadersFor(variant) {
  const base = {
    Event: '?',
    Site: '?',
    Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    Round: '?',
    Result: '*',
  };

  if (variant?.numPlayers === 4) {
    return {
      ...base,
      Red: '?',
      Blue: '?',
      Yellow: '?',
      Green: '?',
    };
  }

  return {
    ...base,
    White: '?',
    Black: '?',
  };
}

function stripPgnHeadersAndNoise(pgn) {
  return pgn
    .replace(/\[.*?\]/g, '')
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/;[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTokens(moveText) {
  return moveText
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !PGN_RESULTS.has(token));
}

function wrap(text, width = 96) {
  const chunks = [];
  for (let i = 0; i < text.length; i += width) {
    chunks.push(text.slice(i, i + width));
  }
  return chunks.join('\n');
}

function labelForPlayer(player, turnLabels) {
  if (Number.isInteger(player) && player >= 0 && player < turnLabels.length) {
    return turnLabels[player];
  }
  return `P${Number.isInteger(player) ? player : '?'}`;
}

function moveSanFrom(entry) {
  return entry?.san || entry?.move?.san || '...';
}

/**
 * Export history to PGN string.
 * Supports: standard (2p), 4player labels, verbose (debug-oriented).
 *
 * @param {Array<{san: string, player?: number, move?: Object}>} history
 * @param {Object} headers
 * @param {Object} options
 * @returns {string}
 */
export function exportPGN(history, headers = {}, options = {}) {
  const variant = options.variant || null;
  const numPlayers = options.numPlayers || variant?.numPlayers || 2;
  const format = normalizeFormat(options.format, numPlayers);
  const includeHeaders = options.includeHeaders !== false;
  const turnLabels = options.turnLabels || variant?.turnLabels || (numPlayers === 4 ? ['R', 'B', 'Y', 'G'] : ['W', 'B']);

  const defaultHeaders = defaultHeadersFor(variant);
  const allHeaders = { ...defaultHeaders, ...headers };
  let pgn = '';

  if (includeHeaders) {
    for (const [key, value] of Object.entries(allHeaders)) {
      pgn += `[${key} "${value}"]\n`;
    }
    pgn += '\n';
  }

  const groupSize = format === 'standard' ? 2 : numPlayers;
  const tokens = [];

  for (let i = 0; i < history.length; i++) {
    if (i % groupSize === 0) {
      tokens.push(`${Math.floor(i / groupSize) + 1}.`);
    }

    const entry = history[i];
    const san = moveSanFrom(entry);
    const playerLabel = labelForPlayer(entry?.player, turnLabels);

    if (format === 'standard') {
      tokens.push(san);
      continue;
    }

    if (format === '4player') {
      tokens.push(`${playerLabel}:${san}`);
      continue;
    }

    const from = entry?.move?.from || '?';
    const to = entry?.move?.to || '?';
    const flags = entry?.move?.flags || '';
    const detail = flags ? `${from}-${to},${flags}` : `${from}-${to}`;
    tokens.push(`${playerLabel}:${san}{${detail}}`);
  }

  tokens.push(allHeaders.Result || '*');
  const body = wrap(tokens.join(' ').trim(), options.wrapWidth || 96);
  return pgn + body;
}

/**
 * Parse PGN into headers and SAN move list.
 * Supports `standard`, `4player`, and `verbose`.
 */
export function parsePGN(pgn, options = {}) {
  const headers = {};
  const headerRegex = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }

  const headerVariant = String(headers.Variant || '').toLowerCase();
  const hintPlayers = options.numPlayers || (headerVariant.startsWith('4player') ? 4 : 2);
  const format = normalizeFormat(options.format, hintPlayers);
  const moveText = stripPgnHeadersAndNoise(pgn);
  const rawTokens = extractTokens(moveText);

  const moves = [];
  for (const token of rawTokens) {
    if (token === '...') continue;

    let moveToken = token;
    if (format === '4player' || format === 'verbose') {
      const colon = token.indexOf(':');
      if (colon !== -1) moveToken = token.slice(colon + 1);
      moveToken = moveToken.replace(/\{.*\}$/, '');
    }

    if (!moveToken || moveToken === '...') continue;
    if (!PGN_RESULTS.has(moveToken)) {
      moves.push(moveToken);
    }
  }

  return { headers, moves };
}
