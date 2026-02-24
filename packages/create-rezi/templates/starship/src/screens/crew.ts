import {
  defineWidget,
  maybe,
  show,
  ui,
  useAsync,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import {
  departmentLabel,
  rankBadge,
  statusBadge,
  crewCounts,
} from "../helpers/formatters.js";
import { selectedCrew, visibleCrew } from "../helpers/state.js";
import { stylesForTheme } from "../theme.js";
import type { CrewMember, RouteDeps, StarshipState } from "../types.js";
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
  const visible = visibleCrew(props.state);
  const selected = selectedCrew(props.state);
  const counts = crewCounts(props.state.crew);

  const [sortColumn, setSortColumn] = ctx.useState<"name" | "rank" | "department" | "status" | "efficiency">(
    "name",
  );
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

  const table = ui.table<CrewMember>({
    id: ctx.id("crew-table"),
    columns: [
      { key: "name", header: "Name", flex: 1, sortable: true },
      { key: "rank", header: "Rank", width: 12, sortable: true },
      { key: "department", header: "Department", width: 14, sortable: true },
      { key: "status", header: "Status", width: 11, sortable: true },
      { key: "efficiency", header: "Efficiency", width: 10, align: "right", sortable: true },
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
  });

  const detailPanel = ui.column({ gap: 1 }, [
    maybe(selected, (member) =>
      ui.panel("Crew Detail", [
        ui.row({ gap: 1, wrap: true }, [
          ui.badge(rankBadge(member.rank).text, { variant: rankBadge(member.rank).variant }),
          ui.badge(statusBadge(member.status).text, { variant: statusBadge(member.status).variant }),
          ui.tag(departmentLabel(member.department), { variant: "info" }),
        ]),
        ui.text(member.name, { variant: "heading" }),
        ui.text(`Efficiency ${member.efficiency}%`, { variant: "code" }),
      ]),
    ) ?? ui.panel("Crew Detail", [ui.empty("No crew selected", { description: "Select a row" })]),
    show(
      props.state.editingCrew,
      ui.panel("Assignment Editor", [
        maybe(selected, (member) =>
          ui.form({ id: ctx.id("crew-edit-form"), gap: 1 }, [
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
      ]),
    ),
  ]);

  return ui.column({ gap: 1 }, [
    ui.panel("Crew Operations", [
      ui.row({ gap: 1, wrap: true }, [
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
    ]),
    show(
      asyncCrew.loading,
      ui.panel("Loading Crew Manifest", [
        ui.row({ gap: 1 }, [ui.spinner(), ui.text("Fetching personnel assignments...")]),
        ui.skeleton(44, { variant: "text" }),
        ui.skeleton(44, { variant: "text" }),
        ui.skeleton(44, { variant: "text" }),
      ]),
    ),
    show(
      !asyncCrew.loading,
      ui.masterDetail({
        id: ctx.id("crew-master-detail"),
        masterWidth: 74,
        master: ui.column({ gap: 1 }, [
          ui.panel("Crew Manifest", [table]),
          ui.pagination({
            id: ctx.id("crew-pagination"),
            page,
            totalPages,
            showFirstLast: true,
            onChange: (nextPage) => props.dispatch({ type: "set-crew-page", page: nextPage }),
          }),
        ]),
        detail: detailPanel,
      }),
    ),
  ]);
});

export function renderCrewScreen(context: RouteRenderContext<StarshipState>, deps: RouteDeps): VNode {
  const styles = stylesForTheme(context.state.themeName);

  return renderShell({
    title: "Crew Manifest",
    context,
    deps,
    body: ui.card(
      {
        title: "Crew Command",
        style: styles.panelStyle,
      },
      [CrewDeck({ state: context.state, dispatch: deps.dispatch })],
    ),
  });
}
