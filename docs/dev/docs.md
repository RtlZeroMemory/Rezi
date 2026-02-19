# Documentation

Rezi's documentation site is built with
[MkDocs Material](https://squidfunnel.com/mkdocs-material/) and deployed to GitHub
Pages via the `docs.yml` workflow.

## Prerequisites

- **Python 3.8+** (for MkDocs)
- **npm** (for TypeDoc API reference generation)

The helper script `scripts/docs.sh` manages the Python virtual environment
automatically -- you do not need to create or activate it manually.

## Local Development

Start the local development server with live reload:

```bash
bash scripts/docs.sh serve
```

This command performs the following steps:

1. Creates a Python virtual environment at `.venv-docs/` if it does not exist.
2. Installs/upgrades dependencies from `requirements-docs.txt`.
3. Runs `npm run docs:api` to generate TypeDoc API reference output into
   `out/typedoc/`.
4. Stages the TypeDoc output into `docs/api/reference/` so MkDocs can
   link-check it.
5. Starts `mkdocs serve` with live reload on `http://127.0.0.1:8000`.

The staged TypeDoc directory is cleaned up automatically when the server stops
(via a shell trap).

## Production Build

Build the static site for deployment:

```bash
bash scripts/docs.sh build
```

This runs `mkdocs build --strict`, which treats all warnings as errors. The
output is written to `out/site/`. The TypeDoc API reference is included at
`out/site/api/reference/`.

## Python Dependencies

The `requirements-docs.txt` file pins the MkDocs ecosystem:

```
mkdocs>=1.6,<1.7
mkdocs-material>=9.5,<10
pymdown-extensions>=10.8,<11
```

If you need to update these versions, edit `requirements-docs.txt` and re-run
the docs script -- it will reinstall into the existing venv.

### Custom Python Path

If `python3` is not on your `PATH`, set the `PYTHON` environment variable:

```bash
PYTHON=/usr/bin/python3.11 bash scripts/docs.sh serve
```

## Adding a New Page

To add a new documentation page:

1. **Create the Markdown file.** Place it in the appropriate directory under
   `docs/`. For example, to add a new widget reference page:

    ```
    docs/widgets/my-widget.md
    ```

2. **Add it to the navigation.** Open `mkdocs.yml` and add an entry under the
   appropriate section in the `nav` key:

    ```yaml
    nav:
      - Widgets:
        - My Widget: widgets/my-widget.md
    ```

3. **Preview locally.** Run `bash scripts/docs.sh serve` and verify the page
   appears in the sidebar and renders correctly.

## Widget Documentation Template

When documenting a widget, follow this structure:

```markdown
# Widget Name

Brief description of the widget and its purpose.

## Props

| Prop      | Type     | Default | Description |
|-----------|----------|---------|-------------|
| `label`   | `string` | --      | The label text. |
| `checked` | `boolean`| `false` | Whether the checkbox is checked. |

## Usage

\`\`\`typescript
import { ui } from "@rezi-ui/core";

ui.myWidget({ label: "Example" });
\`\`\`

## Variants / States

Describe visual variants or interactive states.

## Keyboard Interaction

Document keyboard shortcuts if the widget is interactive.

## See Also

- Links to related widgets or concepts.
```

## API Reference (TypeDoc)

The API reference is generated from TypeScript source comments using TypeDoc:

```bash
npm run docs:api
```

Output goes to `out/typedoc/`. During docs builds, this output is staged into
`docs/api/reference/` temporarily so MkDocs can include it in the site and
validate links.

The TypeDoc configuration is in `typedoc.json` at the repository root.

## Deployment

Documentation is deployed automatically by the `docs.yml` GitHub Actions
workflow. The workflow:

1. Checks out the repository.
2. Runs `bash scripts/docs.sh build` to produce the static site.
3. Deploys the `out/site/` directory to GitHub Pages.

Deployment is triggered on every push to `main`, every pull request, and manual
`workflow_dispatch`. The workflow does not use path filters.

The live site is available at:
[https://rtlzeromemory.github.io/Rezi/](https://rtlzeromemory.github.io/Rezi/)

## See Also

- [Build](build.md)
- [Repo layout](repo-layout.md)
- [Style guide](style-guide.md)
