import type {
  CommandPaletteProps,
  DropdownProps,
  LayerProps,
  ModalProps,
  ToastContainerProps,
} from "../types.js";

const modalBackdropPreset: ModalProps["backdrop"] = "dim";
const modalBackdropObject: ModalProps["backdrop"] = {
  variant: "opaque",
  pattern: "#",
  foreground: { r: 10, g: 20, b: 30 },
  background: { r: 1, g: 2, b: 3 },
};

// @ts-expect-error invalid backdrop variant
const modalBackdropInvalid: ModalProps["backdrop"] = { variant: "blur" };

const dropdownFrame: DropdownProps["frameStyle"] = {
  background: { r: 1, g: 2, b: 3 },
  foreground: { r: 4, g: 5, b: 6 },
  border: { r: 7, g: 8, b: 9 },
};

// @ts-expect-error missing b component
const dropdownFrameInvalid: DropdownProps["frameStyle"] = { border: { r: 1, g: 2 } };

const layerFrame: LayerProps["frameStyle"] = {
  background: { r: 9, g: 9, b: 9 },
  foreground: { r: 200, g: 200, b: 200 },
  border: { r: 120, g: 120, b: 120 },
};

const commandPaletteFrame: CommandPaletteProps["frameStyle"] = {
  background: { r: 12, g: 13, b: 14 },
  foreground: { r: 220, g: 221, b: 222 },
  border: { r: 100, g: 110, b: 120 },
};

const toastFrame: ToastContainerProps["frameStyle"] = {
  background: { r: 15, g: 16, b: 17 },
  foreground: { r: 230, g: 231, b: 232 },
  border: { r: 111, g: 112, b: 113 },
};

void modalBackdropPreset;
void modalBackdropObject;
void modalBackdropInvalid;
void dropdownFrame;
void dropdownFrameInvalid;
void layerFrame;
void commandPaletteFrame;
void toastFrame;
