# Icons

Rezi includes a small icon registry for common UI glyphs. Icons are rendered as
**text**, so they work in any terminal.

Glyph resolution is deterministic and stability-first:

- Rezi prefers single-cell, non-emoji primary glyphs when available.
- If a primary glyph is risky (emoji/ZWJ/ambiguous width), Rezi uses the ASCII fallback.
- Layout width is measured from the resolved glyph, not from the icon key alone.

## Usage

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.icon("status.check");
ui.icon("arrow.right", { style: { fg: rgb(0, 255, 0) } });
ui.icon("ui.search", { fallback: true });
```

## Categories

Icon paths are grouped by category:

- `file.*` — file/folder
- `status.*` — status (check, cross, warning, etc.)
- `arrow.*` — arrows/chevrons
- `git.*` — git status
- `ui.*` — common UI actions (close, menu, play, etc.)

## Fallback behavior

Each icon has:

- a primary glyph (may be Unicode and may be intentionally unset for some icons)
- an ASCII fallback
- deterministic risk-aware resolution (primary vs fallback) based on width stability

Use `fallback: true` to force the ASCII-safe glyph:

```typescript
import { ui } from "@rezi-ui/core";

ui.icon("git.modified", { fallback: true });
ui.icon("file.folder", { fallback: true });
```

If the primary glyph is unset (`(none)` in the tables below), you should use `fallback: true` until a glyph set is provided.

## Width semantics

Layout consumes the resolved glyph width at runtime. This means fallback glyphs
can be wider than one cell (for example, `ui.pause` may resolve to `||`, width
2 in deterministic mode).

The catalog tables below show **nominal single-glyph width intent**, not a hard
layout contract. For exact runtime behavior, rely on resolved glyph measurement.

## Icon registry

The following tables list every registered icon path, its primary glyph, and its fallback.

### file.*

| Icon path | Glyph | Fallback | Nominal Width |
|---|---:|---:|---:|
| `file.file` | `(none)` | `[]` | `1` |
| `file.fileCode` | `(none)` | `<>` | `1` |
| `file.fileText` | `(none)` | `==` | `1` |
| `file.fileConfig` | `(none)` | `@@` | `1` |
| `file.fileBinary` | `(none)` | `##` | `1` |
| `file.folder` | `(none)` | `[+]` | `1` |
| `file.folderOpen` | `(none)` | `[-]` | `1` |
| `file.folderGit` | `(none)` | `[g]` | `1` |

### status.*

| Icon path | Glyph | Fallback | Nominal Width |
|---|---:|---:|---:|
| `status.check` | `✓` | `[x]` | `1` |
| `status.cross` | `✗` | `[X]` | `1` |
| `status.warning` | `⚠` | `[!]` | `1` |
| `status.info` | `ℹ` | `[i]` | `1` |
| `status.error` | `✖` | `[E]` | `1` |
| `status.question` | `?` | `[?]` | `1` |
| `status.pending` | `○` | `[ ]` | `1` |
| `status.success` | `●` | `[*]` | `1` |
| `status.dot` | `•` | `*` | `1` |
| `status.circle` | `○` | `o` | `1` |
| `status.circleFilled` | `●` | `*` | `1` |
| `status.square` | `□` | `[ ]` | `1` |
| `status.squareFilled` | `■` | `[x]` | `1` |

### arrow.*

| Icon path | Glyph | Fallback | Nominal Width |
|---|---:|---:|---:|
| `arrow.up` | `↑` | `^` | `1` |
| `arrow.down` | `↓` | `v` | `1` |
| `arrow.left` | `←` | `<` | `1` |
| `arrow.right` | `→` | `>` | `1` |
| `arrow.upDown` | `↕` | `|` | `1` |
| `arrow.leftRight` | `↔` | `-` | `1` |
| `arrow.chevronUp` | `▲` | `^` | `1` |
| `arrow.chevronDown` | `▼` | `v` | `1` |
| `arrow.chevronLeft` | `◀` | `<` | `1` |
| `arrow.chevronRight` | `▶` | `>` | `1` |
| `arrow.triangleUp` | `△` | `^` | `1` |
| `arrow.triangleDown` | `▽` | `v` | `1` |
| `arrow.triangleLeft` | `◁` | `<` | `1` |
| `arrow.triangleRight` | `▷` | `>` | `1` |
| `arrow.arrowReturn` | `↵` | `<-` | `1` |
| `arrow.arrowTab` | `⇥` | `->` | `1` |

### git.*

| Icon path | Glyph | Fallback | Nominal Width |
|---|---:|---:|---:|
| `git.modified` | `●` | `M` | `1` |
| `git.added` | `+` | `+` | `1` |
| `git.deleted` | `−` | `-` | `1` |
| `git.renamed` | `➜` | `R` | `1` |
| `git.copied` | `⧉` | `C` | `1` |
| `git.untracked` | `?` | `?` | `1` |
| `git.ignored` | `◌` | `I` | `1` |
| `git.conflict` | `!` | `!` | `1` |
| `git.staged` | `✓` | `S` | `1` |
| `git.branch` | `(none)` | `*` | `1` |
| `git.commit` | `(none)` | `o` | `1` |
| `git.merge` | `(none)` | `Y` | `1` |
| `git.stash` | `(none)` | `$` | `1` |

### ui.*

| Icon path | Glyph | Fallback | Nominal Width |
|---|---:|---:|---:|
| `ui.menu` | `☰` | `=` | `1` |
| `ui.close` | `×` | `x` | `1` |
| `ui.search` | `(none)` | `/` | `1` |
| `ui.settings` | `(none)` | `*` | `1` |
| `ui.edit` | `✎` | `e` | `1` |
| `ui.copy` | `⧉` | `c` | `1` |
| `ui.paste` | `(none)` | `p` | `1` |
| `ui.cut` | `(none)` | `x` | `1` |
| `ui.save` | `(none)` | `S` | `1` |
| `ui.undo` | `↶` | `u` | `1` |
| `ui.redo` | `↷` | `r` | `1` |
| `ui.refresh` | `↻` | `R` | `1` |
| `ui.sync` | `(none)` | `~` | `1` |
| `ui.lock` | `(none)` | `#` | `1` |
| `ui.unlock` | `(none)` | `-` | `1` |
| `ui.visible` | `(none)` | `o` | `1` |
| `ui.hidden` | `(none)` | `-` | `1` |
| `ui.expand` | `+` | `+` | `1` |
| `ui.collapse` | `−` | `-` | `1` |
| `ui.filter` | `(none)` | `Y` | `1` |
| `ui.sort` | `(none)` | `^v` | `1` |
| `ui.pin` | `(none)` | `P` | `1` |
| `ui.bookmark` | `(none)` | `B` | `1` |
| `ui.star` | `★` | `*` | `1` |
| `ui.starEmpty` | `☆` | `o` | `1` |
| `ui.heart` | `♥` | `<3` | `1` |
| `ui.heartEmpty` | `♡` | `<>` | `1` |
| `ui.home` | `(none)` | `~` | `1` |
| `ui.terminal` | `(none)` | `>_` | `1` |
| `ui.debug` | `(none)` | `D` | `1` |
| `ui.play` | `▶` | `>` | `1` |
| `ui.pause` | `⏸` | `||` | `1` |
| `ui.stop` | `⏹` | `[]` | `1` |
| `ui.record` | `⏺` | `()` | `1` |

## Related

- [Icon widget](../widgets/icon.md) - Rendering icons in widget trees
- [Styling overview](index.md) - Themes, focus styles, and icons
