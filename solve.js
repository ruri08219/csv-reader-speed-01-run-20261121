// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answer as the reference on every input {text, header} -> {columns, rows, errors},
// but fast: the reference walks the text one character at a time, building every field
// a character at a time. This reader instead works with indexOf/slice over whole spans:
//
//   - A record whose first line holds no quote at all is split in one go (String split
//     is C++): fields, stray CRs counted and stripped, CRLF handled.
//   - Any other record is parsed field by field, each unquoted field found with a
//     couple of indexOf calls and taken as one slice; each quoted field found with
//     indexOf('"') and taken as slices, with CR/CRLF inside quotes normalised to LF.
//   - Quoted fields that span lines, unterminated quotes, quote junk, short/long rows
//     and every error follow the reference exactly (see the comments at each step).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.
// Dependency-free ES module; Node 22+ (also runs on the local Node 24).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // ---- Fast path: the record's first line holds no quote. ----
    // A quoted field always opens on the record's first line (its opening quote is in
    // this segment), so no quote here means no quoted field in this record at all, and
    // the record ends at this line's break (or at the end of the text).
    const nl = text.indexOf('\n', pos);
    const segEnd = nl === -1 ? len : nl;
    const q0 = text.indexOf('"', pos);
    if (q0 === -1 || q0 >= segEnd) {
      let seg = text.slice(pos, segEnd);
      // A trailing CR before the LF is the CRLF that ends the record; a trailing CR
      // with no LF after it is a lone CR and is handled as stray below.
      if (nl !== -1 && seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1);
      let fields;
      const cr = seg.indexOf('\r');
      if (cr === -1) {
        fields = seg.split(',');
      } else {
        // Every CR left is a lone one: dropped, one stray_cr error each.
        let n = 0;
        let p = cr;
        while (p !== -1) {
          n += 1;
          p = seg.indexOf('\r', p + 1);
        }
        for (let i = 0; i < n; i++) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        fields = seg.split('\r').join('').split(',');
      }
      pos = nl === -1 ? len : nl + 1;
      if (nl !== -1) line += 1;
      // A line that held only stray CRs is left with no characters: no record (its
      // stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '') continue;
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
        continue;
      }
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
      continue;
    }

    // ---- General path: this record holds a quote somewhere. ----
    const fields = [];
    let lastQuoted = false;
    let ended = COMMA;
    while (true) {
      const isQuoted = text.charCodeAt(pos) === 34;
      lastQuoted = isQuoted;
      let value;
      if (!isQuoted) {
        // Unquoted field: one scan, one slice (plus a stray-CR tail when needed).
        const scan = scanUnquoted('');
        value = scan.value;
        ended = scan.ended;
      } else {
        // Quoted field: runs to the next quote that is not doubled.
        const open = pos;
        const openLine = line;
        pos += 1;
        let val = '';
        let closed = false;
        let scanInit = null; // non-null: an unquoted tail scan follows (junk / unterminated)
        let trackJunk = false;
        while (true) {
          const q = text.indexOf('"', pos);
          if (q === -1) {
            // The quote never closes: it is a literal character, and the text after it
            // is read again as unquoted.
            pos = open + 1;
            line = openLine;
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            scanInit = '"';
            break;
          }
          if (q > pos) {
            // The span up to the quote: CRLF and lone CR inside quotes are each one LF.
            const chunk = text.slice(pos, q);
            if (chunk.indexOf('\r') === -1) {
              if (chunk.indexOf('\n') !== -1) {
                let p = -1;
                let n = 0;
                while ((p = chunk.indexOf('\n', p + 1)) !== -1) n += 1;
                line += n;
              }
              val += chunk;
            } else {
              const breaks = chunk.match(/\r\n?|\n/g);
              if (breaks !== null) line += breaks.length;
              val += chunk.replace(/\r\n?/g, '\n');
            }
          }
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: one quote in the value, keep scanning.
            val += '"';
            pos = q + 2;
            continue;
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (closed) {
          if (pos >= len) {
            value = val;
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              value = val;
              pos += 1;
              ended = COMMA;
            } else if (c === 10) {
              value = val;
              pos += 1;
              line += 1;
              ended = LINE_BREAK;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              value = val;
              pos += 2;
              line += 1;
              ended = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands, up to the
              // next comma or line break.
              scanInit = val;
              trackJunk = true;
            }
          }
        }
        if (scanInit !== null) {
          const scan = scanUnquoted(scanInit);
          value = scan.value;
          ended = scan.ended;
          if (trackJunk && scan.added > 0) {
            errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
        }
      }
      fields.push(value);
      if (ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };

  // Reads unquoted characters onto `init` up to the next comma or line break: a CR
  // not followed by LF is dropped (stray_cr). Returns {value, ended, added}, where
  // `added` counts the characters kept after `init`. The next comma / line break is
  // found first (both scans stop a few characters out); a CR can only hide inside
  // that short span, so it is looked for in the span itself, never with an
  // unbounded scan over the rest of the text.
  function scanUnquoted(init) {
    let value = init;
    let added = 0;
    while (true) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let end;
      let kind;
      if (comma !== -1 && (lf === -1 || comma < lf)) {
        end = comma;
        kind = COMMA;
      } else if (lf !== -1) {
        end = lf;
        kind = LINE_BREAK;
      } else {
        end = len;
        kind = END;
      }
      const chunk = text.slice(pos, end);
      const cr = chunk.indexOf('\r');
      if (cr === -1) {
        value += chunk;
        added += chunk.length;
        if (kind === COMMA) {
          pos = end + 1;
          return { value, ended: COMMA, added };
        }
        if (kind === LINE_BREAK) {
          pos = end + 1;
          line += 1;
          return { value, ended: LINE_BREAK, added };
        }
        pos = len;
        return { value, ended: END, added };
      }
      if (cr === chunk.length - 1 && kind === LINE_BREAK) {
        // The CR is the CRLF that ends the record.
        value += chunk.slice(0, -1);
        added += chunk.length - 1;
        pos = end + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A lone CR: dropped, one stray_cr error, and the field goes on.
      value += chunk.slice(0, cr);
      added += cr;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = pos + cr + 1;
    }
  }
}
