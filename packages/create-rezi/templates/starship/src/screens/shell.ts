import type {
  CommandItem,
  CommandSource,
  RegisteredBinding,
  RouteRenderContext,
  VNode,
} from "@rezi-ui/core";
import { routerBreadcrumb, routerTabs, ui } from "@rezi-ui/core";
import { alertLabel } from "../helpers/formatters.js";
import { systemHealth } from "../helpers/state.js";
import { alertBadgeVariant, PRODUCT_NAME, PRODUCT_TAGLINE, stylesForTheme, themeSpec } from "../theme.js";
import { toCoreToast, type RouteDeps, type RouteId, type StarshipState } from "../types.js";

type ShellOptions = Readonly<{
  title: string;
  context: RouteRenderContext<StarshipState>;
  body: VNode;
  deps: RouteDeps;
}>;

function routeCommandItems(routes: readonly Readonly<{ id: RouteId; title: string }>[]): readonly CommandItem[] {
  const shortcutByRouteId: Readonly<Record<RouteId, string>> = Object.freeze({
    bridge: "1",
    engineering: "2",
    crew: "3",
    comms: "4",
    cargo: "5",
    settings: "6",
  });

  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        id: `route-${route.id}`,
        label: `Go to ${route.title}`,
        description: `Navigate to ${route.title} deck`,
        ...(shortcutByRouteId[route.id] ? { shortcut: shortcutByRouteId[route.id] } : {}),
        icon: "#",
        sourceId: "routes",
        data: route.id,
      }),
    ),
  );
}

function commandItems(): readonly CommandItem[] {
  return Object.freeze([
    Object.freeze({
      id: "cmd-red-alert",
      label: "Toggle Red Alert",
      description: "Raise or lower red alert",
      shortcut: "r",
      icon: "!",
      sourceId: "commands",
    }),
    Object.freeze({
      id: "cmd-theme",
      label: "Cycle Theme",
      description: "Rotate day/night/alert themes",
      shortcut: "t",
      icon: "*",
      sourceId: "commands",
    }),
    Object.freeze({
      id: "cmd-autopilot",
      label: "Toggle Autopilot",
      description: "Enable or disable autopilot",
      shortcut: "a",
      icon: ">",
      sourceId: "commands",
    }),
    Object.freeze({
      id: "cmd-hail",
      label: "Open Hail Dialog",
      description: "Compose outbound hail",
      shortcut: "h",
      icon: "@",
      sourceId: "commands",
    }),
  ]);
}

function filterItems(items: readonly CommandItem[], query: string): readonly CommandItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return Object.freeze(
    items.filter((item) =>
      `${item.label} ${item.description ?? ""}`.toLowerCase().includes(normalized),
    ),
  );
}

function keybindingsFallback(): readonly RegisteredBinding[] {
  return Object.freeze([]);
}

export function renderShell(options: ShellOptions): VNode {
  const state = options.context.state;
  const styles = stylesForTheme(state.themeName);
  const health = systemHealth(state);
  const theme = themeSpec(state.themeName);

  const routeDefinitions = options.deps.routes.map((route) => ({
    id: route.id,
    title: route.title,
    screen: () => ui.text(route.title),
  }));

  const sidebarItems = options.deps.routes.map((route) => ({
    id: route.id,
    label: route.title,
    icon: route.id === "bridge" ? "*" : route.id === "engineering" ? "+" : "-",
  }));

  const currentRoute = options.context.router.currentRoute().id as RouteId;

  const shell = ui.appShell({
    p: 1,
    gap: 1,
    header: ui.header({
      title: `${state.shipName} · ${options.title}`,
      subtitle: PRODUCT_TAGLINE,
      actions: [
        ui.badge("Fleet Active", { variant: "success" }),
        ui.badge(alertLabel(state.alertLevel), { variant: alertBadgeVariant(state.alertLevel) }),
        ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
        ui.status(state.autopilot ? "online" : "away", {
          label: state.autopilot ? "Autopilot" : "Manual",
        }),
      ],
    }),
    sidebar: {
      width: 28,
      content: ui.column({ gap: 1 }, [
        ui.sidebar({
          id: "deck-sidebar",
          title: "Decks",
          items: sidebarItems,
          selected: currentRoute,
          onSelect: (id) => options.deps.navigate(id as RouteId),
        }),
        ui.panel("Route Health", [
          ...options.deps.routes.map((route) =>
            ui.row({ key: `route-health-${route.id}`, gap: 1, items: "center" }, [
              ui.status(route.id === currentRoute ? "online" : "away", { showLabel: false }),
              ui.text(route.title, { variant: "label" }),
            ]),
          ),
        ]),
      ]),
    },
    body: ui.column({ gap: 1 }, [
      routerBreadcrumb(options.context.router, routeDefinitions, {
        id: "bridge-breadcrumb",
        separator: ">",
      }),
      routerTabs(options.context.router, routeDefinitions, {
        id: "bridge-router-tabs",
        variant: "pills",
        historyMode: "replace",
      }),
      options.body,
    ]),
    footer: ui.statusBar({
      left: [
        ui.row({ gap: 1 }, [
          ui.text("Alert", { variant: "caption", style: styles.mutedStyle }),
          ui.badge(alertLabel(state.alertLevel), { variant: alertBadgeVariant(state.alertLevel) }),
          ui.text(`Systems ${health.average}%`, { variant: "code", style: styles.codeStyle }),
        ]),
      ],
      right: [
        ui.row({ gap: 1 }, [
          ui.text(`Tick ${String(state.tick).padStart(5, "0")}`, { variant: "caption" }),
          ui.kbd(["Ctrl", "P"]),
          ui.text("Palette", { variant: "caption", style: styles.mutedStyle }),
        ]),
      ],
      style: styles.statusStyle,
    }),
  });

  const commandSources: readonly CommandSource[] = Object.freeze([
    Object.freeze({
      id: "commands",
      name: "Commands",
      prefix: ">",
      priority: 20,
      getItems: (query: string) => filterItems(commandItems(), query),
    }),
    Object.freeze({
      id: "routes",
      name: "Routes",
      prefix: "#",
      priority: 10,
      getItems: (query: string) => filterItems(routeCommandItems(options.deps.routes), query),
    }),
  ]);

  return ui.layers([
    shell,
    state.toasts.length > 0
      ? ui.layer({
          id: "shell-toast-layer",
          modal: false,
          closeOnEscape: false,
          backdrop: "none",
          zIndex: 100,
          content: ui.toastContainer({
            toasts: state.toasts.map(toCoreToast),
            position: "bottom-right",
            maxVisible: 4,
            width: 50,
            onDismiss: (id) => options.deps.dispatch({ type: "dismiss-toast", toastId: id }),
          }),
        })
      : null,
    state.showCommandPalette
      ? ui.layer({
          id: "shell-command-layer",
          modal: true,
          closeOnEscape: true,
          onClose: () => options.deps.dispatch({ type: "toggle-command-palette" }),
          backdrop: "dim",
          zIndex: 200,
          content: ui.commandPalette({
            id: "shell-command-palette",
            open: state.showCommandPalette,
            query: state.commandQuery,
            sources: commandSources,
            selectedIndex: state.commandIndex,
            placeholder: "Type command or route",
            onQueryChange: (query) => options.deps.dispatch({ type: "set-command-query", query }),
            onSelectionChange: (index) => options.deps.dispatch({ type: "set-command-index", index }),
            onSelect: (item) => {
              if (typeof item.data === "string") {
                options.deps.navigate(item.data as RouteId);
              } else {
                options.deps.dispatch({ type: "apply-command", commandId: item.id });
              }
            },
            onClose: () => options.deps.dispatch({ type: "toggle-command-palette" }),
          }),
        })
      : null,
    state.showHelp
      ? ui.layer({
          id: "shell-help-layer",
          modal: true,
          closeOnEscape: true,
          onClose: () => options.deps.dispatch({ type: "toggle-help" }),
          backdrop: "dim",
          zIndex: 300,
          content: ui.modal({
            id: "shell-help-modal",
            title: `${PRODUCT_NAME} Keybindings`,
            width: 84,
            returnFocusTo: `deck-sidebar-${currentRoute}`,
            initialFocus: "close-help-modal",
            onClose: () => options.deps.dispatch({ type: "toggle-help" }),
            content: ui.column({ gap: 1 }, [
              ui.callout("Global navigation and deck controls", {
                variant: "info",
                title: "Starship Controls",
              }),
              ui.keybindingHelp(options.deps.getBindings ? options.deps.getBindings() : keybindingsFallback(), {
                title: "Active Keybindings",
              }),
            ]),
            actions: [
              ui.button({
                id: "close-help-modal",
                label: "Close",
                intent: "primary",
                onPress: () => options.deps.dispatch({ type: "toggle-help" }),
              }),
            ],
          }),
        })
      : null,
  ]);
}
