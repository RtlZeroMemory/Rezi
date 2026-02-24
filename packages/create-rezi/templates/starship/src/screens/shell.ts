import {
  ui,
  type CommandItem,
  type CommandSource,
  type RegisteredBinding,
  type RouteRenderContext,
  type VNode,
} from "@rezi-ui/core";
import { debugSnapshot } from "../helpers/debug.js";
import { resolveLayout, routeLabel } from "../helpers/layout.js";
import { alertLabel } from "../helpers/formatters.js";
import { systemHealth } from "../helpers/state.js";
import {
  SPACE,
  alertBadgeVariant,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  stylesForTheme,
  themeSpec,
  toHex,
  themeTokens,
} from "../theme.js";
import { toCoreToast, type RouteDeps, type RouteId, type StarshipState } from "../types.js";
import { surfacePanel } from "./primitives.js";

type ShellOptions = Readonly<{
  title: string;
  context: RouteRenderContext<StarshipState>;
  body: VNode;
  rightRail?: VNode;
  deps: RouteDeps;
}>;

function routeCommandItems(
  routes: readonly Readonly<{ id: RouteId; title: string }>[],
): readonly CommandItem[] {
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

function normalizedPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function routeHealthScore(routeId: RouteId, state: StarshipState): number {
  if (routeId === "bridge") return normalizedPercent(state.telemetry.hullIntegrity);
  if (routeId === "engineering") {
    return normalizedPercent(
      state.subsystems.reduce((sum, item) => sum + item.health, 0) /
        Math.max(1, state.subsystems.length),
    );
  }
  if (routeId === "crew") {
    const active = state.crew.filter((member) => member.status === "active").length;
    return normalizedPercent(Math.max(10, Math.min(100, (active / Math.max(1, state.crew.length)) * 130)));
  }
  if (routeId === "comms") {
    const backlog = state.messages.filter((message) => !message.acknowledged).length;
    return normalizedPercent(Math.max(20, 100 - Math.min(80, backlog * 2)));
  }
  if (routeId === "cargo") {
    const lowPriority = state.cargo.filter((item) => item.priority <= 2).length;
    return normalizedPercent(Math.max(25, 100 - Math.min(75, Math.floor(lowPriority / 15))));
  }
  return normalizedPercent(Math.max(40, Math.min(100, state.alertThreshold + 8)));
}

export function renderShell(options: ShellOptions): VNode {
  const state = options.context.state;
  const styles = stylesForTheme(state.themeName);
  const tokens = themeTokens(state.themeName);
  const theme = themeSpec(state.themeName);
  const health = systemHealth(state);
  const layout = resolveLayout({
    width: state.viewportCols,
    height: state.viewportRows,
  });
  const compactHeight = layout.height <= 34;
  const minimalHeight = layout.height <= 30;
  const showBreadcrumbStrip = !compactHeight;
  const showTabsStrip = !minimalHeight;
  const showSidebar = !minimalHeight && layout.width >= 78;
  const showRouteHealth = !compactHeight && showSidebar;
  const showToastOverlay = !compactHeight && state.toasts.length > 0;
  const showRightRail = Boolean(options.rightRail && !layout.hideNonCritical && layout.height >= 40);
  debugSnapshot("shell.layout", {
    route: options.context.router.currentRoute().id,
    viewportCols: state.viewportCols,
    viewportRows: state.viewportRows,
    layoutWidth: layout.width,
    layoutHeight: layout.height,
    showSidebar,
    showRouteHealth,
    showToastOverlay,
    showRightRail,
    compactHeight,
    minimalHeight,
  });

  const routeDefinitions = options.deps.routes.map((route) => ({
    id: route.id,
    title: route.title,
    screen: () => ui.text(route.title),
  }));
  const currentRoute = options.context.router.currentRoute().id as RouteId;
  const routeTabsTone = state.themeName === "alert" ? "danger" : state.themeName === "day" ? "primary" : "default";
  const currentRouteTitle =
    routeDefinitions.find((route) => route.id === currentRoute)?.title ?? currentRoute;
  const contextStatus =
    state.alertLevel === "red"
      ? "Red alert protocol active"
      : state.autopilot
        ? `${currentRouteTitle} systems on autopilot`
        : `${currentRouteTitle} manual control`;

  const navPanel = surfacePanel(
    tokens,
    "Navigation",
    [
      ui.text("Decks", { variant: "label" }),
      ui.text(layout.compactSidebar ? "Compact mode" : "Command routing", {
        variant: "caption",
        style: { fg: tokens.text.dim, dim: true },
      }),
      ui.divider({ color: toHex(tokens.border.muted) }),
      ui.column(
        { gap: SPACE.xs },
        options.deps.routes.map((route) => {
          const active = currentRoute === route.id;
          const health = routeHealthScore(route.id, state);
          const degraded = health < 60;
          return ui.box(
            {
              key: `deck-nav-box-${route.id}`,
              border: "none",
              p: 0,
              px: 0,
              py: 0,
              style: active
                ? { bg: tokens.state.selectedBg, fg: tokens.state.selectedText }
                : { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
              inheritStyle: { fg: active ? tokens.state.selectedText : tokens.text.primary },
            },
            [
              ui.row({ gap: SPACE.xs, items: "center", wrap: false }, [
                ui.text(active ? "||" : "··", {
                  style: active
                    ? { fg: tokens.accent.brand, bold: true }
                    : { fg: tokens.text.dim, dim: true },
                }),
                ui.button({
                  id: `deck-sidebar-${route.id}`,
                  label: routeLabel(route.id, route.title, layout.compactSidebar),
                  dsVariant: active ? "solid" : "ghost",
                  dsTone: active ? routeTabsTone : "default",
                  dsSize: "sm",
                  onPress: () => options.deps.navigate(route.id),
                }),
                ui.spacer({ flex: 1 }),
                ui.status(degraded ? "busy" : active ? "online" : "away", { showLabel: false }),
              ]),
            ],
          );
        }),
      ),
      ...(showRouteHealth
        ? [
            ui.divider({ color: toHex(tokens.border.muted) }),
            ui.text("Route Health", { variant: "label" }),
            ui.text("Muted until degraded", {
              variant: "caption",
              style: { fg: tokens.text.dim, dim: true },
            }),
            ui.column(
              { gap: SPACE.xs },
              options.deps.routes.map((route) => {
                const score = routeHealthScore(route.id, state);
                const degraded = score < 60;
                const warning = score < 85;
                const variant = degraded ? "error" : warning ? "warning" : "default";
                const barColor = degraded
                  ? tokens.accent.danger
                  : warning
                    ? tokens.accent.warn
                    : tokens.accent.success;
                return ui.column({ key: `route-health-${route.id}`, gap: SPACE.xs }, [
                  ui.row({ gap: SPACE.xs, items: "center", wrap: false }, [
                    ui.text(routeLabel(route.id, route.title, layout.compactSidebar), {
                      variant: "caption",
                      style: degraded
                        ? { fg: tokens.accent.danger, bold: true }
                        : warning
                          ? { fg: tokens.accent.warn }
                          : { fg: tokens.text.muted, dim: true },
                    }),
                    ui.spacer({ flex: 1 }),
                    ui.text(`${score}%`, {
                      variant: "code",
                      style:
                        variant === "error"
                          ? { fg: tokens.accent.danger, bold: true }
                          : variant === "warning"
                            ? { fg: tokens.accent.warn, bold: true }
                            : { fg: tokens.text.muted },
                    }),
                  ]),
                  ui.progress(score / 100, {
                    width: layout.compactSidebar ? 10 : 16,
                    style: { fg: barColor },
                    trackStyle: { fg: tokens.progress.track },
                  }),
                ]);
              }),
            ),
          ]
        : []),
    ],
    {
      tone: "inset",
      p: SPACE.xs,
      gap: SPACE.sm,
    },
  );

  const breadcrumbStrip = ui.box(
    {
      border: "none",
      p: SPACE.xs,
      width: "100%",
      style: { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
      inheritStyle: { fg: tokens.text.primary },
    },
    [
      ui.row({ gap: SPACE.sm, wrap: false, items: "center" }, [
        ui.breadcrumb({
          id: "bridge-breadcrumb",
          separator: ">",
          dsVariant: "soft",
          dsTone: routeTabsTone,
          dsSize: layout.compactSidebar ? "sm" : "md",
          items: [
            {
              label: "Decks",
              onPress: () => options.deps.navigate("bridge"),
            },
            {
              label: currentRouteTitle,
            },
          ],
        }),
        ui.spacer({ flex: 1 }),
        ...(layout.wide
          ? [
              ui.text(`Deck · ${currentRouteTitle}`, {
                variant: "caption",
                style: { fg: tokens.text.dim, dim: true },
              }),
            ]
          : []),
      ]),
    ],
  );

  const tabsStrip = ui.box(
    {
      border: "none",
      p: SPACE.xs,
      width: "100%",
      style: { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
      inheritStyle: { fg: tokens.text.primary },
    },
    [
      ui.row(
        {
          gap: SPACE.xs,
          wrap: true,
          items: "center",
        },
        [
          ...options.deps.routes.map((route) => {
            const active = route.id === currentRoute;
            return ui.box(
              {
                key: `route-tab-box-${route.id}`,
                border: "none",
                p: 0,
                style: active
                  ? { bg: tokens.table.headerBg, fg: tokens.text.primary }
                  : { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
              },
              [
                ui.button({
                  key: `route-tab-${route.id}`,
                  id: `route-tab-${route.id}`,
                  label: route.title,
                  dsVariant: active ? "solid" : "soft",
                  dsTone: active ? routeTabsTone : "default",
                  dsSize: layout.compactSidebar ? "sm" : "md",
                  style: active ? { bold: true } : { fg: tokens.text.muted },
                  onPress: () => options.deps.navigate(route.id),
                }),
              ],
            );
          }),
          ui.spacer({ flex: 1 }),
          ...(layout.wide
            ? [
                ui.row({ gap: SPACE.xs, wrap: false, items: "center" }, [
                  ui.kbd(["1-6"]),
                  ui.text("Decks", {
                    variant: "caption",
                    style: { fg: tokens.text.dim, dim: true },
                  }),
                ]),
              ]
            : []),
        ],
      ),
    ],
  );

  const bodyMain = ui.column(
    {
      gap: SPACE.sm,
      width: "100%",
      height: "100%",
    },
    [
      ...(showBreadcrumbStrip ? [breadcrumbStrip] : []),
      ...(showTabsStrip ? [tabsStrip] : []),
      ui.box(
        {
          border: "none",
          p: 0,
          width: "100%",
          flex: 1,
          style: { bg: tokens.bg.app, fg: tokens.text.primary },
          inheritStyle: { fg: tokens.text.primary },
        },
        [options.body],
      ),
    ],
  );

  const rightRailNode = showRightRail ? options.rightRail ?? null : null;
  const bodyWithRail =
    rightRailNode
      ? layout.stackRightRail
        ? ui.column({ gap: SPACE.sm, width: "100%", height: "100%" }, [bodyMain, rightRailNode])
        : ui.row({ gap: SPACE.sm, items: "stretch", width: "100%", height: "100%" }, [
            ui.box({ flex: 2, border: "none", p: 0 }, [bodyMain]),
            ui.box({ flex: 1, border: "none", p: 0 }, [rightRailNode]),
          ])
      : bodyMain;

  const headerNode = minimalHeight
    ? ui.row({ gap: SPACE.sm, items: "center", wrap: true }, [
        ui.text(`${state.shipName} · ${options.title}`, { variant: "label", style: styles.accentStyle }),
        ui.badge(alertLabel(state.alertLevel), { variant: alertBadgeVariant(state.alertLevel) }),
        ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
      ])
    : ui.header({
        title: `${state.shipName} · ${options.title}`,
        ...(compactHeight ? {} : { subtitle: PRODUCT_TAGLINE }),
        actions: compactHeight
          ? [
              ui.badge(alertLabel(state.alertLevel), { variant: alertBadgeVariant(state.alertLevel) }),
              ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
              ui.status(state.autopilot ? "online" : "away", {
                label: state.autopilot ? "Autopilot" : "Manual",
              }),
            ]
          : [
              ui.badge("Fleet Active", { variant: "success" }),
              ui.badge(alertLabel(state.alertLevel), { variant: alertBadgeVariant(state.alertLevel) }),
              ui.tag(`Theme ${theme.label}`, { variant: theme.badge }),
              ui.status(state.autopilot ? "online" : "away", {
                label: state.autopilot ? "Autopilot" : "Manual",
              }),
            ],
      });

  const headerContent = ui.box(
    {
      border: "none",
      p: 0,
      width: "100%",
      style: { bg: tokens.bg.panel.base, fg: tokens.text.primary },
      inheritStyle: { fg: tokens.text.primary },
    },
    [headerNode],
  );

  const sidebarContent = ui.box(
    {
      border: "none",
      p: 0,
      width: "100%",
      height: "100%",
      style: { bg: tokens.bg.app, fg: tokens.text.primary },
      inheritStyle: { fg: tokens.text.primary },
    },
    [navPanel],
  );

  const bodyContent = ui.box(
    {
      border: "none",
      p: 0,
      width: "100%",
      height: "100%",
      style: { bg: tokens.bg.app, fg: tokens.text.primary },
      inheritStyle: { fg: tokens.text.primary },
    },
    [bodyWithRail],
  );

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
    ui.box(
      {
        border: "none",
        p: 0,
        width: "100%",
        height: "100%",
        style: { bg: tokens.bg.app, fg: tokens.text.primary },
        inheritStyle: { fg: tokens.text.primary },
      },
      [
        ui.appShell({
          p: minimalHeight ? 0 : SPACE.xs,
          gap: minimalHeight ? 0 : SPACE.xs,
          header: headerContent,
          ...(showSidebar
            ? {
                sidebar: {
                  width: layout.sidebarWidth,
                  content: sidebarContent,
                },
              }
            : { sidebar: null }),
          body: bodyContent,
          footer: ui.statusBar({
            left: [
              ui.row({ gap: SPACE.lg, wrap: false, items: "center" }, [
                ui.row({ gap: SPACE.xs, wrap: false, items: "center" }, [
                  ui.text("Alert", { variant: "caption", style: styles.mutedStyle }),
                  ui.badge(alertLabel(state.alertLevel), {
                    variant: alertBadgeVariant(state.alertLevel),
                  }),
                  ui.text(`Systems ${health.average}%`, { variant: "code", style: styles.codeStyle }),
                ]),
                ui.text(contextStatus, {
                  variant: "caption",
                  style: { fg: tokens.text.dim, dim: true },
                }),
              ]),
            ],
            right: [
              ui.row({ gap: SPACE.sm }, [
                ui.text(`Tick ${String(state.tick).padStart(5, "0")}`, { variant: "caption" }),
                ...(minimalHeight
                  ? []
                  : [ui.kbd(["Ctrl", "P"]), ui.text("Palette", { variant: "caption", style: styles.mutedStyle })]),
              ]),
            ],
            style: styles.statusStyle,
          }),
        }),
      ],
    ),
    showToastOverlay
      ? ui.layer({
          id: "shell-toast-layer",
          modal: false,
          closeOnEscape: false,
          backdrop: "none",
          zIndex: 100,
          content: ui.toastContainer({
            toasts: state.toasts.map((toast) => {
              const marker =
                toast.level === "error"
                  ? "▌"
                  : toast.level === "warning"
                    ? "▍"
                    : toast.level === "success"
                      ? "▪"
                      : "·";
              const coreToast = toCoreToast(toast);
              return Object.freeze({
                ...coreToast,
                message: `${marker} ${coreToast.message}`,
              });
            }),
            position: "bottom-right",
            maxVisible: 4,
            width: Math.max(28, Math.min(52, layout.width - 6)),
            frameStyle: {
              border: state.themeName === "alert" ? tokens.border.danger : tokens.border.focus,
              background: tokens.bg.panel.elevated,
              foreground: tokens.text.primary,
            },
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
          frameStyle: {
            border: tokens.border.focus,
            background: tokens.bg.modal,
            foreground: tokens.text.primary,
          },
          content: ui.commandPalette({
            id: "shell-command-palette",
            open: state.showCommandPalette,
            query: state.commandQuery,
            sources: commandSources,
            selectedIndex: state.commandIndex,
            placeholder: "Type command or route",
            onQueryChange: (query) => options.deps.dispatch({ type: "set-command-query", query }),
            onSelectionChange: (index) =>
              options.deps.dispatch({ type: "set-command-index", index }),
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
          frameStyle: {
            border: tokens.border.focus,
            background: tokens.bg.modal,
            foreground: tokens.text.primary,
          },
          content: ui.modal({
            id: "shell-help-modal",
            title: `${PRODUCT_NAME} Keybindings`,
            width: 86,
            returnFocusTo: `deck-sidebar-${currentRoute}`,
            initialFocus: "close-help-modal",
            onClose: () => options.deps.dispatch({ type: "toggle-help" }),
            content: ui.column({ gap: SPACE.sm }, [
              ui.callout("Global navigation and deck controls", {
                variant: "info",
                title: "Starship Controls",
              }),
              ui.keybindingHelp(
                options.deps.getBindings ? options.deps.getBindings() : keybindingsFallback(),
                {
                  title: "Active Keybindings",
                },
              ),
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
