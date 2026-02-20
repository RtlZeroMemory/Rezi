import type { LinkProps } from "./types.js";

export function linkLabel(props: LinkProps): string {
  return props.label && props.label.length > 0 ? props.label : props.url;
}

export function isLinkEnabled(props: LinkProps): boolean {
  return props.disabled !== true;
}
