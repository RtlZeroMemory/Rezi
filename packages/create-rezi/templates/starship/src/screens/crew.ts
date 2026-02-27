import {
  defineWidget,
  maybe,
  show,
  ui,
  useAsync,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { debugSnapshot } from "../helpers/debug.js";
import { resolveLayout } from "../helpers/layout.js";
import { crewCounts, departmentLabel, rankBadge, statusBadge } from "../helpers/formatters.js";
import { selectedCrew, visibleCrew } from "../helpers/state.js";
import { SPACE, themeTokens } from "../theme.js";
import type { CrewMember, RouteDeps, StarshipState } from "../types.js";
import { progressRow, sectionHeader, surfacePanel, tableSkin } from "./primitives.js";
import { renderShell } from "./shell.js";

function validateCriticalDepartments(crew: readonly CrewMember[]): string | null {
  const counts = {
    bridge: 0,
    engineering: 0,
    security: 0,
  };

  for (const member of crew) {
    if (member.status !== "active") continue;
    if (member.department === "bridge") counts.bridge += 1;
    if (member.department === "engineering") counts.engineering += 1;
    if (member.department === "security") counts.security += 1;
  }

  if (counts.bridge < 12) return "Bridge requires at least 12 assigned crew members.";
  if (counts.engineering < 18) return "Engineering requires at least 18 assigned crew members.";
  if (counts.security < 10) return "Security requires at least 10 assigned crew members.";
  return null;
}

type CrewDeckProps = Readonly<{
  key?: string;
  state: StarshipState;
  dispatch: RouteDeps["dispatch"];
}>;

const CrewDeck = defineWidget<CrewDeckProps>((props, ctx): VNode => {
  const tokens = themeTokens(props.state.themeName);
  const layout = resolveLayout({
    width: props.state.viewportCols,
    height: props.state.viewportRows,
  });
  const compactHeight = layout.height < 34;
  const showDetailPane = layout.height >= 38;
  const visible = visibleCrew(props.state);
  const selected = selectedCrew(props.state);
  const counts = crewCounts(props.state.crew);

  const [sortColumn, setSortColumn] = ctx.useState<
    "name" | "rank" | "department" | "status" | "efficiency"
  >("name");
  const [sortDirection, setSortDirection] = ctx.useState<"asc" | "desc">("asc");

  const asyncCrew = useAsync(
    ctx,
    async () => visible,
    [visible.length, props.state.crewSearchQuery, props.state.tick % 4],
  );

  const sorted = ctx.useMemo(() => {
    const list = [...visible];
    list.sort((left, right) => {
      let result = 0;
      if (sortColumn === "name") result = left.name.localeCompare(right.name);
      if (sortColumn === "rank") result = left.rank.localeCompare(right.rank);
      if (sortColumn === "department") result = left.department.localeCompare(right.department);
      if (sortColumn === "status") result = left.status.localeCompare(right.status);
      if (sortColumn === "efficiency") result = left.efficiency - right.efficiency;
      return sortDirection === "asc" ? result : -result;
    });
    return list;
  }, [visible, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / props.state.crewPageSize));
  const page = Math.max(1, Math.min(props.state.crewPage, totalPages));
  const start = (page - 1) * props.state.crewPageSize;
  const pageData = sorted.slice(start, start + props.state.crewPageSize);
  const staffingError = ctx.useMemo(() => {
    if (!selected) return validateCriticalDepartments(props.state.crew);
    const projected = props.state.crew.map((member) =>
      member.id === selected.id
        ? Object.freeze({
            ...member,
            department: props.state.crewDraft.department,
            status: props.state.crewDraft.status,
          })
        : member,
    );
    return validateCriticalDepartments(projected);
  }, [props.state.crew, props.state.crewDraft.department, props.state.crewDraft.status, selected?.id]);

  if (compactHeight) {
    return ui.column({ gap: SPACE.sm }, [
      surfacePanel(tokens, "Crew Snapshot", [
        sectionHeader(tokens, "Compact Crew View", "Expand terminal height for full manifest table"),
        ui.row({ gap: SPACE.xs, wrap: true }, [
          ui.badge(`Total ${counts.total}`, { variant: "info" }),
          ui.badge(`Active ${counts.active}`, { variant: "success" }),
          ui.badge(`Away ${counts.away}`, { variant: "warning" }),
          ui.badge(`Injured ${counts.injured}`, { variant: "error" }),
        ]),
        selected
          ? ui.row({ gap: SPACE.xs, wrap: true }, [
              ui.text(selected.name, { variant: "label" }),
              ui.badge(rankBadge(selected.rank).text, { variant: rankBadge(selected.rank).variant }),
              ui.badge(statusBadge(selected.status).text, {
                variant: statusBadge(selected.status).variant,
              }),
              ui.tag(departmentLabel(selected.department), { variant: "info" }),
            ])
          : ui.callout("No crew member selected yet.", { variant: "info", title: "Selection" }),
      ]),
      surfacePanel(
        tokens,
        "Crew Actions",
        [
          ui.form([
            ui.field({
              label: "Search Crew",
              children: ui.input({
                id: ctx.id("crew-search-compact"),
                value: props.state.crewSearchQuery,
                placeholder: "Type to filter",
                onInput: (value) => props.dispatch({ type: "set-crew-search", query: value }),
              }),
            }),
          ]),
          ui.actions([
            ui.button({
              id: ctx.id("crew-compact-new-assignment"),
              label: "New Assignment",
              intent: "primary",
              onPress: () => props.dispatch({ type: "toggle-crew-editor" }),
            }),
            ui.button({
              id: ctx.id("crew-compact-edit-selected"),
              label: "Edit Selected",
              intent: "secondary",
              onPress: () => props.dispatch({ type: "toggle-crew-editor" }),
            }),
          ]),
        ],
        { tone: "inset" },
      ),
    ]);
  }

  const table = ui.table<CrewMember>({
    id: ctx.id("crew-table"),
    columns: [
      { key: "name", header: "Name", flex: 1, sortable: true },
      { key: "rank", header: "Rank", width: 12, sortable: true },
      { key: "department", header: "Department", width: 14, sortable: true },
      { key: "status", header: "Status", width: 12, sortable: true },
      { key: "efficiency", header: "Efficiency", width: 11, align: "right", sortable: true },
    ],
    data: pageData,
    getRowKey: (member) => member.id,
    selectionMode: "single",
    selection: selected ? [selected.id] : [],
    sortColumn,
    sortDirection,
    onSort: (column, direction) => {
      if (
        column === "name" ||
        column === "rank" ||
        column === "department" ||
        column === "status" ||
        column === "efficiency"
      ) {
        setSortColumn(column);
      }
      setSortDirection(direction);
    },
    onSelectionChange: (keys) => {
      const key = keys[0];
      props.dispatch({
        type: "select-crew",
        crewId: typeof key === "string" ? key : null,
      });
    },
    onRowPress: (row) => props.dispatch({ type: "select-crew", crewId: row.id }),
    dsSize: "sm",
    dsTone: "default",
    virtualized: true,
    ...tableSkin(tokens),
  });

  const detailPanel = ui.column({ gap: SPACE.sm, width: "100%", height: "100%" }, [
    maybe(selected, (member) =>
      surfacePanel(
        tokens,
        "Crew Detail",
        [
          sectionHeader(tokens, member.name, departmentLabel(member.department)),
          ui.row({ gap: SPACE.sm, wrap: true }, [
            ui.badge(rankBadge(member.rank).text, { variant: rankBadge(member.rank).variant }),
            ui.badge(statusBadge(member.status).text, { variant: statusBadge(member.status).variant }),
            ui.tag(departmentLabel(member.department), { variant: "info" }),
          ]),
          progressRow(tokens, "Efficiency", member.efficiency / 100, {
            labelWidth: 12,
            width: Math.max(18, layout.chartWidth - 10),
            tone: member.efficiency < 45 ? "warning" : "success",
            trend: member.efficiency >= 50 ? 1 : -1,
          }),
        ],
        { tone: "elevated" },
      ),
    ) ??
      surfacePanel(tokens, "Crew Detail", [
        ui.empty("No crew selected", { description: "Select a row" }),
      ], { tone: "inset" }),
    show(
      props.state.editingCrew,
      surfacePanel(tokens, "Assignment Editor", [
        maybe(selected, (member) =>
          ui.form({ id: ctx.id("crew-edit-form"), gap: SPACE.sm }, [
            ui.field({
              label: "Department",
              required: true,
              children: ui.select({
                id: ctx.id("crew-dept-select"),
                value: props.state.crewDraft.department,
                options: [
                  { value: "bridge", label: "Bridge" },
                  { value: "engineering", label: "Engineering" },
                  { value: "medical", label: "Medical" },
                  { value: "science", label: "Science" },
                  { value: "security", label: "Security" },
                ],
                onChange: (value) =>
                  props.dispatch({
                    type: "set-crew-draft-department",
                    department: value as CrewMember["department"],
                  }),
              }),
            }),
            ui.field({
              label: "Status",
              children: ui.radioGroup({
                id: ctx.id("crew-status-group"),
                value: props.state.crewDraft.status,
                direction: "vertical",
                options: [
                  { value: "active", label: "Active" },
                  { value: "off-duty", label: "Off Duty" },
                  { value: "injured", label: "Injured" },
                  { value: "away", label: "Away" },
                ],
                onChange: (value) =>
                  props.dispatch({
                    type: "set-crew-draft-status",
                    status: value as CrewMember["status"],
                  }),
              }),
            }),
            staffingError
              ? ui.callout(staffingError, {
                  variant: "warning",
                  title: "Staffing Guardrail",
                })
              : ui.callout("Critical departments meet minimum staffing.", {
                  variant: "success",
                  title: "Validation",
                }),
            ui.actions([
              ui.button({
                id: ctx.id("crew-save"),
                label: "Save Assignment",
                intent: "primary",
                onPress: () => {
                  if (!staffingError) {
                    props.dispatch({
                      type: "assign-crew",
                      crewId: member.id,
                      department: props.state.crewDraft.department,
                      status: props.state.crewDraft.status,
                    });
                  }
                },
              }),
              ui.button({
                id: ctx.id("crew-cancel"),
                label: "Cancel",
                intent: "secondary",
                onPress: () => props.dispatch({ type: "toggle-crew-editor" }),
              }),
            ]),
          ]),
        ) ?? ui.text("Select a crew member first", { variant: "caption" }),
      ], { tone: "elevated" }),
    ),
  ]);

  const manifestBlock = ui.column({ gap: SPACE.sm, width: "100%", height: "100%" }, [
    ui.box(
      {
        border: "none",
        p: 0,
        width: "100%",
        flex: 1,
        minHeight: 10,
        overflow: "hidden",
      },
      [surfacePanel(tokens, "Crew Manifest", [table])],
    ),
    ui.pagination({
      id: ctx.id("crew-pagination"),
      page,
      totalPages,
      showFirstLast: true,
      onChange: (nextPage) => props.dispatch({ type: "set-crew-page", page: nextPage }),
    }),
  ]);

  const deckLayout = layout.wide
    ? showDetailPane
      ? ui.row(
          {
            id: ctx.id("crew-master-detail"),
            gap: SPACE.sm,
            width: "100%",
            height: "100%",
            items: "stretch",
            wrap: false,
          },
          [
            ui.box(
              {
                border: "none",
                p: 0,
                width: layout.crewMasterWidth,
                height: "100%",
                overflow: "hidden",
              },
              [manifestBlock],
            ),
            ui.box(
              {
                border: "none",
                p: 0,
                flex: 1,
                height: "100%",
                overflow: "hidden",
              },
              [detailPanel],
            ),
          ],
        )
      : manifestBlock
    : showDetailPane
      ? ui.column({ gap: SPACE.sm, width: "100%", height: "100%" }, [
          ui.box(
            { border: "none", p: 0, width: "100%", flex: 1, minHeight: 10, overflow: "hidden" },
            [manifestBlock],
          ),
          ui.box(
            { border: "none", p: 0, width: "100%", flex: 1, minHeight: 10, overflow: "hidden" },
            [detailPanel],
          ),
        ])
      : manifestBlock;

  const operationsPanelMaxHeight = Math.max(12, Math.min(22, Math.floor(layout.height * 0.34)));
  debugSnapshot("crew.render", {
    viewportCols: props.state.viewportCols,
    viewportRows: props.state.viewportRows,
    visibleCount: visible.length,
    sortedCount: sorted.length,
    page,
    totalPages,
    pageDataCount: pageData.length,
    showDetailPane,
    operationsPanelMaxHeight,
    editingCrew: props.state.editingCrew,
  });
  const operationsPanel = ui.box(
    {
      border: "none",
      p: 0,
      width: "100%",
      height: operationsPanelMaxHeight,
      overflow: "scroll",
    },
    [
      surfacePanel(
        tokens,
        "Crew Operations",
        [
          sectionHeader(tokens, "Manifest Controls", "Consistent staffing and assignment flow"),
          ui.row({ gap: SPACE.md, wrap: !layout.wide, items: "start" }, [
            ui.box(
              {
                border: "none",
                p: 0,
                gap: SPACE.sm,
                ...(layout.wide ? { flex: 2 } : {}),
              },
              [
                ui.row({ gap: SPACE.sm, wrap: true }, [
                  ui.badge(`Total ${counts.total}`, { variant: "info" }),
                  ui.badge(`Active ${counts.active}`, { variant: "success" }),
                  ui.badge(`Away ${counts.away}`, { variant: "warning" }),
                  ui.badge(`Injured ${counts.injured}`, { variant: "error" }),
                ]),
                ui.form([
                  ui.field({
                    label: "Search Crew",
                    hint: "Filter by name, rank, or department",
                    children: ui.input({
                      id: ctx.id("crew-search"),
                      value: props.state.crewSearchQuery,
                      placeholder: "Type to filter",
                      onInput: (value) => props.dispatch({ type: "set-crew-search", query: value }),
                    }),
                  }),
                ]),
                ui.actions([
                  ui.button({
                    id: ctx.id("crew-new-assignment"),
                    label: "New Assignment",
                    intent: "primary",
                    onPress: () => props.dispatch({ type: "toggle-crew-editor" }),
                  }),
                  ui.button({
                    id: ctx.id("crew-edit-selected"),
                    label: "Edit Selected",
                    intent: "secondary",
                    onPress: () => props.dispatch({ type: "toggle-crew-editor" }),
                  }),
                ]),
              ],
            ),
            ...(layout.wide
              ? [
                  ui.box(
                    {
                      border: "none",
                      p: 0,
                      flex: 1,
                    },
                    [
                      surfacePanel(
                        tokens,
                        "Crew Snapshot",
                        [
                          selected
                            ? ui.column({ gap: SPACE.xs }, [
                                ui.text(selected.name, { variant: "label" }),
                                ui.row({ gap: SPACE.xs, wrap: true }, [
                                  ui.badge(rankBadge(selected.rank).text, {
                                    variant: rankBadge(selected.rank).variant,
                                  }),
                                  ui.badge(statusBadge(selected.status).text, {
                                    variant: statusBadge(selected.status).variant,
                                  }),
                                  ui.tag(departmentLabel(selected.department), { variant: "info" }),
                                ]),
                              ])
                            : ui.text("No crew selected", {
                                variant: "caption",
                                style: { fg: tokens.text.muted, dim: true },
                              }),
                          ui.divider(),
                          ui.row({ gap: SPACE.xs, wrap: true }, [
                            ui.badge(`Visible ${sorted.length}`, { variant: "info" }),
                            ui.badge(`Page ${page}/${totalPages}`, { variant: "default" }),
                          ]),
                          staffingError
                            ? ui.callout("Critical staffing below minimum.", {
                                title: "Guardrail",
                                variant: "warning",
                              })
                            : ui.callout("Critical staffing thresholds healthy.", {
                                title: "Guardrail",
                                variant: "success",
                              }),
                        ],
                        {
                          tone: "inset",
                          p: SPACE.sm,
                          gap: SPACE.sm,
                        },
                      ),
                    ],
                  ),
                ]
              : []),
          ]),
        ],
        { tone: "base" },
      ),
    ],
  );

  return ui.column({ gap: SPACE.md, width: "100%", height: "100%" }, [
    operationsPanel,
    show(
      asyncCrew.loading,
      surfacePanel(tokens, "Loading Crew Manifest", [
        ui.row({ gap: SPACE.sm }, [ui.spinner(), ui.text("Fetching personnel assignments...")]),
        ui.skeleton(44, { variant: "text" }),
        ui.skeleton(44, { variant: "text" }),
        ui.skeleton(44, { variant: "text" }),
      ], { tone: "inset" }),
    ),
    show(
      !asyncCrew.loading,
      ui.box(
        {
          border: "none",
          p: 0,
          width: "100%",
          flex: 1,
          minHeight: 12,
          overflow: "hidden",
        },
        [deckLayout],
      ),
    ),
  ]);
});

export function renderCrewScreen(context: RouteRenderContext<StarshipState>, deps: RouteDeps): VNode {
  return renderShell({
    title: "Crew Manifest",
    context,
    deps,
    body: ui.column({ gap: SPACE.sm, width: "100%", height: "100%" }, [
      CrewDeck({
        key: "crew-deck",
        state: context.state,
        dispatch: deps.dispatch,
      }),
    ]),
  });
}
