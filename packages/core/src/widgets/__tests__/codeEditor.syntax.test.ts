import { assert, describe, test } from "@rezi-ui/testkit";
import {
  normalizeCodeEditorTokens,
  tokenizeCodeEditorLine,
  tokenizeCodeEditorLineWithCustom,
} from "../codeEditorSyntax.js";
import type { CodeEditorSyntaxToken } from "../types.js";

function tokenKinds(tokens: readonly CodeEditorSyntaxToken[]): readonly string[] {
  return tokens.map((token) => token.kind);
}

describe("codeEditor.syntax - built-in language tokenization", () => {
  test("tokenizes TypeScript keywords, function calls, and strings", () => {
    const tokens = tokenizeCodeEditorLine('const title = format("ok");', {
      language: "typescript",
    });
    assert.equal(tokenKinds(tokens).includes("keyword"), true);
    assert.equal(tokenKinds(tokens).includes("function"), true);
    assert.equal(tokenKinds(tokens).includes("string"), true);
  });

  test("tokenizes Go keywords/types and comments", () => {
    const tokens = tokenizeCodeEditorLine("func main() { var n int // hello }", {
      language: "go",
    });
    assert.equal(tokenKinds(tokens).includes("keyword"), true);
    assert.equal(tokenKinds(tokens).includes("type"), true);
    assert.equal(tokenKinds(tokens).includes("comment"), true);
  });

  test("tokenizes Rust keywords/types", () => {
    const tokens = tokenizeCodeEditorLine("fn parse(value: i64) -> bool { true }", {
      language: "rust",
    });
    assert.equal(tokenKinds(tokens).includes("keyword"), true);
    assert.equal(tokenKinds(tokens).includes("type"), true);
  });

  test("tokenizes C/C++/C#/Java aliases", () => {
    const cxx = tokenizeCodeEditorLine('std::string value = "ok";', { language: "c++" });
    const csharp = tokenizeCodeEditorLine('var s = @"hello"; // note', { language: "c#" });
    const java = tokenizeCodeEditorLine("public static void main(String[] args) {}", {
      language: "java",
    });
    assert.equal(tokenKinds(cxx).includes("type"), true);
    assert.equal(tokenKinds(cxx).includes("string"), true);
    assert.equal(tokenKinds(csharp).includes("string"), true);
    assert.equal(tokenKinds(csharp).includes("comment"), true);
    assert.equal(tokenKinds(java).includes("keyword"), true);
  });

  test("tokenizes Python and Bash with hash comments", () => {
    const python = tokenizeCodeEditorLine("def run(x): return x # py", { language: "python" });
    const bash = tokenizeCodeEditorLine('if [ -n "$X" ]; then echo ok; fi # sh', {
      language: "bash",
    });
    assert.equal(tokenKinds(python).includes("keyword"), true);
    assert.equal(tokenKinds(python).includes("comment"), true);
    assert.equal(tokenKinds(bash).includes("keyword"), true);
    assert.equal(tokenKinds(bash).includes("comment"), true);
  });
});

describe("codeEditor.syntax - custom tokenizer safety", () => {
  test("normalizes malformed token arrays to plain line", () => {
    const normalized = normalizeCodeEditorTokens("hello", [{ text: "hel", kind: "keyword" }]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]?.kind, "plain");
    assert.equal(normalized[0]?.text, "hello");
  });

  test("custom tokenizer failure degrades gracefully", () => {
    const tokens = tokenizeCodeEditorLineWithCustom(
      "const x = 1;",
      { language: "typescript", lineNumber: 0 },
      () => {
        throw new Error("boom");
      },
    );
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.kind, "plain");
  });
});
