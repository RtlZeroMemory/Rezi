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
  foreground: (10 << 16) | (20 << 8) | 30,
  background: (1 << 16) | (2 << 8) | 3,
};

// @ts-expect-error invalid backdrop variant
const modalBackdropInvalid: ModalProps["backdrop"] = { variant: "blur" };

const dropdownFrame: DropdownProps["frameStyle"] = {
  background: (1 << 16) | (2 << 8) | 3,
  foreground: (4 << 16) | (5 << 8) | 6,
  border: (7 << 16) | (8 << 8) | 9,
};

// @ts-expect-error frameStyle.border expects packed Rgb24, not an object
const dropdownFrameInvalid: DropdownProps["frameStyle"] = { border: { r: 1, g: 2 } };

const layerFrame: LayerProps["frameStyle"] = {
  background: (9 << 16) | (9 << 8) | 9,
  foreground: (200 << 16) | (200 << 8) | 200,
  border: (120 << 16) | (120 << 8) | 120,
};

const commandPaletteFrame: CommandPaletteProps["frameStyle"] = {
  background: (12 << 16) | (13 << 8) | 14,
  foreground: (220 << 16) | (221 << 8) | 222,
  border: (100 << 16) | (110 << 8) | 120,
};

const toastFrame: ToastContainerProps["frameStyle"] = {
  background: (15 << 16) | (16 << 8) | 17,
  foreground: (230 << 16) | (231 << 8) | 232,
  border: (111 << 16) | (112 << 8) | 113,
};

void modalBackdropPreset;
void modalBackdropObject;
void modalBackdropInvalid;
void dropdownFrame;
void dropdownFrameInvalid;
void layerFrame;
void commandPaletteFrame;
void toastFrame;
