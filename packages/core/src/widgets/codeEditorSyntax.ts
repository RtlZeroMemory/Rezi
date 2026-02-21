import type {
  CodeEditorSyntaxLanguage,
  CodeEditorSyntaxToken,
  CodeEditorSyntaxTokenKind,
  CodeEditorTokenizeContext,
} from "./types.js";

type CanonicalLanguage =
  | "plain"
  | "typescript"
  | "javascript"
  | "json"
  | "go"
  | "rust"
  | "c"
  | "cpp"
  | "csharp"
  | "java"
  | "python"
  | "bash";

type LanguageGrammar = Readonly<{
  keywords: ReadonlySet<string>;
  types: ReadonlySet<string>;
  lineComment: "//" | "#";
  blockComments: boolean;
  allowSingleQuotedStrings: boolean;
  allowDoubleQuotedStrings: boolean;
  allowBacktickStrings: boolean;
}>;

type Scanner = {
  source: string;
  index: number;
  tokens: CodeEditorSyntaxToken[];
};

const EMPTY_SET = new Set<string>();

const TYPESCRIPT_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const TYPESCRIPT_TYPES = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "number",
  "object",
  "string",
  "symbol",
  "unknown",
  "void",
]);

const JAVASCRIPT_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const JSON_KEYWORDS = new Set(["true", "false", "null"]);

const GO_KEYWORDS = new Set([
  "break",
  "case",
  "chan",
  "const",
  "continue",
  "default",
  "defer",
  "else",
  "fallthrough",
  "for",
  "func",
  "go",
  "goto",
  "if",
  "import",
  "interface",
  "map",
  "package",
  "range",
  "return",
  "select",
  "struct",
  "switch",
  "type",
  "var",
]);

const GO_TYPES = new Set([
  "any",
  "bool",
  "byte",
  "complex64",
  "complex128",
  "error",
  "float32",
  "float64",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "rune",
  "string",
  "uint",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "uintptr",
]);

const RUST_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
]);

const RUST_TYPES = new Set([
  "bool",
  "char",
  "f32",
  "f64",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "isize",
  "str",
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "usize",
]);

const C_KEYWORDS = new Set([
  "auto",
  "break",
  "case",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "enum",
  "extern",
  "for",
  "goto",
  "if",
  "inline",
  "register",
  "restrict",
  "return",
  "sizeof",
  "static",
  "struct",
  "switch",
  "typedef",
  "union",
  "volatile",
  "while",
]);

const C_TYPES = new Set([
  "bool",
  "char",
  "double",
  "float",
  "int",
  "long",
  "short",
  "signed",
  "size_t",
  "ssize_t",
  "uint8_t",
  "uint16_t",
  "uint32_t",
  "uint64_t",
  "unsigned",
  "void",
]);

const CPP_KEYWORDS = new Set([
  "alignas",
  "alignof",
  "and",
  "asm",
  "auto",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "constexpr",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "explicit",
  "export",
  "extern",
  "final",
  "for",
  "friend",
  "goto",
  "if",
  "inline",
  "namespace",
  "new",
  "noexcept",
  "operator",
  "override",
  "private",
  "protected",
  "public",
  "return",
  "sizeof",
  "static",
  "struct",
  "switch",
  "template",
  "this",
  "throw",
  "try",
  "typedef",
  "typename",
  "union",
  "using",
  "virtual",
  "while",
]);

const CPP_TYPES = new Set([
  "auto",
  "bool",
  "char",
  "char8_t",
  "char16_t",
  "char32_t",
  "double",
  "float",
  "int",
  "long",
  "short",
  "signed",
  "size_t",
  "std",
  "string",
  "unsigned",
  "void",
  "wchar_t",
]);

const CSHARP_KEYWORDS = new Set([
  "abstract",
  "as",
  "async",
  "await",
  "base",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delegate",
  "do",
  "else",
  "enum",
  "event",
  "explicit",
  "extern",
  "false",
  "finally",
  "for",
  "foreach",
  "goto",
  "if",
  "implicit",
  "in",
  "interface",
  "internal",
  "is",
  "lock",
  "namespace",
  "new",
  "null",
  "operator",
  "out",
  "override",
  "params",
  "private",
  "protected",
  "public",
  "readonly",
  "ref",
  "return",
  "sealed",
  "static",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "using",
  "var",
  "virtual",
  "void",
  "while",
]);

const CSHARP_TYPES = new Set([
  "bool",
  "byte",
  "char",
  "decimal",
  "double",
  "dynamic",
  "float",
  "int",
  "long",
  "object",
  "sbyte",
  "short",
  "string",
  "uint",
  "ulong",
  "ushort",
  "void",
]);

const JAVA_KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "void",
  "volatile",
  "while",
]);

const JAVA_TYPES = new Set([
  "boolean",
  "byte",
  "char",
  "double",
  "float",
  "int",
  "long",
  "short",
  "String",
  "Object",
  "List",
  "Map",
  "Set",
]);

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const PYTHON_TYPES = new Set([
  "bool",
  "bytes",
  "dict",
  "float",
  "int",
  "list",
  "object",
  "set",
  "str",
  "tuple",
]);

const BASH_KEYWORDS = new Set([
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "time",
  "until",
  "while",
]);

const GRAMMARS: Readonly<Record<CanonicalLanguage, LanguageGrammar>> = Object.freeze({
  plain: Object.freeze({
    keywords: EMPTY_SET,
    types: EMPTY_SET,
    lineComment: "//",
    blockComments: false,
    allowSingleQuotedStrings: false,
    allowDoubleQuotedStrings: false,
    allowBacktickStrings: false,
  }),
  typescript: Object.freeze({
    keywords: TYPESCRIPT_KEYWORDS,
    types: TYPESCRIPT_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: true,
  }),
  javascript: Object.freeze({
    keywords: JAVASCRIPT_KEYWORDS,
    types: EMPTY_SET,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: true,
  }),
  json: Object.freeze({
    keywords: JSON_KEYWORDS,
    types: EMPTY_SET,
    lineComment: "//",
    blockComments: false,
    allowSingleQuotedStrings: false,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  go: Object.freeze({
    keywords: GO_KEYWORDS,
    types: GO_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: true,
  }),
  rust: Object.freeze({
    keywords: RUST_KEYWORDS,
    types: RUST_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  c: Object.freeze({
    keywords: C_KEYWORDS,
    types: C_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  cpp: Object.freeze({
    keywords: CPP_KEYWORDS,
    types: CPP_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  csharp: Object.freeze({
    keywords: CSHARP_KEYWORDS,
    types: CSHARP_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  java: Object.freeze({
    keywords: JAVA_KEYWORDS,
    types: JAVA_TYPES,
    lineComment: "//",
    blockComments: true,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  python: Object.freeze({
    keywords: PYTHON_KEYWORDS,
    types: PYTHON_TYPES,
    lineComment: "#",
    blockComments: false,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: false,
  }),
  bash: Object.freeze({
    keywords: BASH_KEYWORDS,
    types: EMPTY_SET,
    lineComment: "#",
    blockComments: false,
    allowSingleQuotedStrings: true,
    allowDoubleQuotedStrings: true,
    allowBacktickStrings: true,
  }),
});

const PUNCTUATION_CHARS = new Set(["(", ")", "{", "}", "[", "]", ",", ".", ";", ":"]);
const OPERATOR_CHARS = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "<",
  ">",
  "!",
  "&",
  "|",
  "^",
  "~",
  "?",
]);

const VALID_TOKEN_KINDS = new Set<CodeEditorSyntaxTokenKind>([
  "plain",
  "keyword",
  "type",
  "string",
  "number",
  "comment",
  "operator",
  "punctuation",
  "function",
  "variable",
]);

function normalizeLanguage(language: CodeEditorSyntaxLanguage | undefined): CanonicalLanguage {
  switch (language) {
    case "typescript":
    case "javascript":
    case "json":
    case "go":
    case "rust":
    case "c":
    case "cpp":
    case "csharp":
    case "java":
    case "python":
    case "bash":
    case "plain":
      return language;
    case "c++":
      return "cpp";
    case "c#":
      return "csharp";
    default:
      return "plain";
  }
}

function asChar(source: string, index: number): string {
  return source[index] ?? "";
}

function pushToken(
  tokens: CodeEditorSyntaxToken[],
  text: string,
  kind: CodeEditorSyntaxTokenKind,
): void {
  if (text.length === 0) return;
  tokens.push(Object.freeze({ text, kind }));
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function isWordStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$";
}

function isWordPart(ch: string): boolean {
  return isWordStart(ch) || (ch >= "0" && ch <= "9");
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function consumeWhitespace(scanner: Scanner): void {
  const start = scanner.index;
  while (isWhitespace(asChar(scanner.source, scanner.index))) {
    scanner.index += 1;
  }
  pushToken(scanner.tokens, scanner.source.slice(start, scanner.index), "plain");
}

function consumeWord(scanner: Scanner): string {
  const start = scanner.index;
  scanner.index += 1;
  while (isWordPart(asChar(scanner.source, scanner.index))) {
    scanner.index += 1;
  }
  return scanner.source.slice(start, scanner.index);
}

function consumeNumber(scanner: Scanner): string {
  const source = scanner.source;
  const start = scanner.index;
  scanner.index += 1;

  while (scanner.index < source.length) {
    const ch = asChar(source, scanner.index);
    if (isDigit(ch) || ch === "_") {
      scanner.index += 1;
      continue;
    }
    if (
      (ch === "." ||
        ch === "x" ||
        ch === "X" ||
        ch === "b" ||
        ch === "B" ||
        ch === "o" ||
        ch === "O") &&
      scanner.index > start
    ) {
      scanner.index += 1;
      continue;
    }
    break;
  }

  return source.slice(start, scanner.index);
}

function consumeString(scanner: Scanner, quote: string): string {
  const source = scanner.source;
  const start = scanner.index;
  scanner.index += 1;

  while (scanner.index < source.length) {
    const ch = asChar(source, scanner.index);
    if (ch === "\\") {
      scanner.index += Math.min(2, source.length - scanner.index);
      continue;
    }
    scanner.index += 1;
    if (ch === quote) break;
  }

  return source.slice(start, scanner.index);
}

function consumeCSharpVerbatimString(scanner: Scanner): string {
  const source = scanner.source;
  const start = scanner.index;
  scanner.index += 2;

  while (scanner.index < source.length) {
    const ch = asChar(source, scanner.index);
    if (ch === '"') {
      const next = asChar(source, scanner.index + 1);
      if (next === '"') {
        scanner.index += 2;
        continue;
      }
      scanner.index += 1;
      break;
    }
    scanner.index += 1;
  }

  return source.slice(start, scanner.index);
}

function consumeOperator(scanner: Scanner): string {
  const source = scanner.source;
  const start = scanner.index;
  scanner.index += 1;
  while (scanner.index < source.length && OPERATOR_CHARS.has(asChar(source, scanner.index))) {
    scanner.index += 1;
  }
  return source.slice(start, scanner.index);
}

function classifyWord(
  word: string,
  scanner: Scanner,
  grammar: LanguageGrammar,
): CodeEditorSyntaxTokenKind {
  if (grammar.keywords.has(word)) return "keyword";
  if (grammar.types.has(word)) return "type";

  let lookahead = scanner.index;
  while (isWhitespace(asChar(scanner.source, lookahead))) {
    lookahead += 1;
  }
  if (asChar(scanner.source, lookahead) === "(") return "function";

  if (/^[A-Z_][A-Z0-9_]{1,}$/.test(word)) return "variable";
  return "plain";
}

function tokenizeLineWithGrammar(
  line: string,
  grammar: LanguageGrammar,
  language: CanonicalLanguage,
): readonly CodeEditorSyntaxToken[] {
  const scanner: Scanner = { source: line, index: 0, tokens: [] };

  while (scanner.index < line.length) {
    const ch = asChar(line, scanner.index);
    const next = asChar(line, scanner.index + 1);

    if (isWhitespace(ch)) {
      consumeWhitespace(scanner);
      continue;
    }

    if (grammar.lineComment === "#" && ch === "#") {
      pushToken(scanner.tokens, line.slice(scanner.index), "comment");
      break;
    }

    if (grammar.lineComment === "//" && ch === "/" && next === "/") {
      pushToken(scanner.tokens, line.slice(scanner.index), "comment");
      break;
    }

    if (grammar.blockComments && ch === "/" && next === "*") {
      const start = scanner.index;
      scanner.index += 2;
      while (scanner.index < line.length) {
        const a = asChar(line, scanner.index);
        const b = asChar(line, scanner.index + 1);
        scanner.index += 1;
        if (a === "*" && b === "/") {
          scanner.index += 1;
          break;
        }
      }
      pushToken(scanner.tokens, line.slice(start, scanner.index), "comment");
      continue;
    }

    if (language === "csharp" && ch === "@" && next === '"') {
      pushToken(scanner.tokens, consumeCSharpVerbatimString(scanner), "string");
      continue;
    }

    if (
      (ch === "'" && grammar.allowSingleQuotedStrings) ||
      (ch === '"' && grammar.allowDoubleQuotedStrings) ||
      (ch === "`" && grammar.allowBacktickStrings)
    ) {
      pushToken(scanner.tokens, consumeString(scanner, ch), "string");
      continue;
    }

    if (isDigit(ch) || (ch === "-" && isDigit(next))) {
      pushToken(scanner.tokens, consumeNumber(scanner), "number");
      continue;
    }

    if (isWordStart(ch)) {
      const word = consumeWord(scanner);
      pushToken(scanner.tokens, word, classifyWord(word, scanner, grammar));
      continue;
    }

    if (PUNCTUATION_CHARS.has(ch)) {
      scanner.index += 1;
      pushToken(scanner.tokens, ch, "punctuation");
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      pushToken(scanner.tokens, consumeOperator(scanner), "operator");
      continue;
    }

    scanner.index += 1;
    pushToken(scanner.tokens, ch, "plain");
  }

  return Object.freeze(scanner.tokens);
}

function plainLine(line: string): readonly CodeEditorSyntaxToken[] {
  if (line.length === 0) return Object.freeze([]);
  return Object.freeze([Object.freeze({ text: line, kind: "plain" as const })]);
}

export function tokenizeCodeEditorLine(
  line: string,
  context: Readonly<{ language?: CodeEditorSyntaxLanguage }> = {},
): readonly CodeEditorSyntaxToken[] {
  const source = typeof line === "string" ? line : "";
  if (source.length === 0) return Object.freeze([]);

  const language = normalizeLanguage(context.language);
  if (language === "plain") return plainLine(source);

  const grammar = GRAMMARS[language] ?? GRAMMARS.plain;
  return tokenizeLineWithGrammar(source, grammar, language);
}

/**
 * Sanitizes custom tokenizer output and guarantees full line coverage.
 * Invalid/mismatched token arrays degrade to a single plain token.
 */
export function normalizeCodeEditorTokens(
  line: string,
  tokens: readonly CodeEditorSyntaxToken[],
): readonly CodeEditorSyntaxToken[] {
  if (line.length === 0) return Object.freeze([]);
  if (!Array.isArray(tokens) || tokens.length === 0) return plainLine(line);

  let stitched = "";
  const normalized: CodeEditorSyntaxToken[] = [];
  for (const token of tokens) {
    if (!token || typeof token.text !== "string") continue;
    const kind = VALID_TOKEN_KINDS.has(token.kind) ? token.kind : "plain";
    if (token.text.length === 0) continue;
    stitched += token.text;
    normalized.push(Object.freeze({ text: token.text, kind }));
  }

  if (normalized.length === 0 || stitched !== line) return plainLine(line);
  return Object.freeze(normalized);
}

export function tokenizeCodeEditorLineWithCustom(
  line: string,
  context: CodeEditorTokenizeContext,
  customTokenizer:
    | ((line: string, context: CodeEditorTokenizeContext) => readonly CodeEditorSyntaxToken[])
    | null,
): readonly CodeEditorSyntaxToken[] {
  if (typeof customTokenizer === "function") {
    try {
      return normalizeCodeEditorTokens(line, customTokenizer(line, context));
    } catch {
      return plainLine(line);
    }
  }
  return normalizeCodeEditorTokens(
    line,
    tokenizeCodeEditorLine(line, { language: context.language }),
  );
}
