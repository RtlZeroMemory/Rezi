const KEYWORDS = new Set(["import", "from", "export", "const", "let", "function", "return"]);
const IDENTIFIERS = new Set(["ui", "SELF_EDIT_BANNER"]);

function isWordStart(char) {
  return /[A-Za-z_$]/.test(char);
}

function isWordPart(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function isNumberStart(char) {
  return /[0-9]/.test(char);
}

function isOperator(char) {
  return "=+-*/<>|&!?:".includes(char);
}

function token(text, tone) {
  return Object.freeze({ text, tone });
}

export function tokenizeCodeLine(line) {
  const source = typeof line === "string" ? line : "";
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] ?? "";

    if (char === "/" && next === "/") {
      tokens.push(token(source.slice(index), "comment"));
      break;
    }

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\" && end + 1 < source.length) {
          end += 2;
          continue;
        }
        if (source[end] === quote) {
          end++;
          break;
        }
        end++;
      }
      tokens.push(token(source.slice(index, end), "string"));
      index = end;
      continue;
    }

    if (isWordStart(char)) {
      let end = index + 1;
      while (end < source.length && isWordPart(source[end])) end++;
      const word = source.slice(index, end);
      const lookahead = source.slice(end).trimStart();
      if (KEYWORDS.has(word)) tokens.push(token(word, "keyword"));
      else if (IDENTIFIERS.has(word)) tokens.push(token(word, "identifier"));
      else if (lookahead.startsWith("(")) tokens.push(token(word, "call"));
      else tokens.push(token(word, "plain"));
      index = end;
      continue;
    }

    if (isNumberStart(char)) {
      let end = index + 1;
      while (end < source.length && /[0-9_]/.test(source[end])) end++;
      tokens.push(token(source.slice(index, end), "number"));
      index = end;
      continue;
    }

    if (isOperator(char)) {
      tokens.push(token(char, "operator"));
      index++;
      continue;
    }

    if ("(){}[],:.;".includes(char)) {
      tokens.push(token(char, "punct"));
      index++;
      continue;
    }

    tokens.push(token(char, "plain"));
    index++;
  }

  return Object.freeze(tokens);
}
