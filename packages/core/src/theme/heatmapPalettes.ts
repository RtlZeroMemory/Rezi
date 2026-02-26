import { type Rgb24, rgb } from "../widgets/style.js";

type HeatmapPaletteScale = "viridis" | "plasma" | "inferno" | "magma" | "turbo" | "grayscale";

export type HeatmapScaleStop = Readonly<{ t: number; rgb: Rgb24 }>;

export const HEATMAP_SCALE_ANCHORS: Readonly<
  Record<HeatmapPaletteScale, readonly HeatmapScaleStop[]>
> = Object.freeze({
  viridis: Object.freeze([
    { t: 0, rgb: rgb(68, 1, 84) },
    { t: 0.25, rgb: rgb(59, 82, 139) },
    { t: 0.5, rgb: rgb(33, 145, 140) },
    { t: 0.75, rgb: rgb(94, 201, 98) },
    { t: 1, rgb: rgb(253, 231, 37) },
  ]),
  plasma: Object.freeze([
    { t: 0, rgb: rgb(13, 8, 135) },
    { t: 0.25, rgb: rgb(126, 3, 168) },
    { t: 0.5, rgb: rgb(203, 71, 119) },
    { t: 0.75, rgb: rgb(248, 149, 64) },
    { t: 1, rgb: rgb(240, 249, 33) },
  ]),
  inferno: Object.freeze([
    { t: 0, rgb: rgb(0, 0, 4) },
    { t: 0.25, rgb: rgb(87, 15, 109) },
    { t: 0.5, rgb: rgb(187, 55, 84) },
    { t: 0.75, rgb: rgb(249, 142, 8) },
    { t: 1, rgb: rgb(252, 255, 164) },
  ]),
  magma: Object.freeze([
    { t: 0, rgb: rgb(0, 0, 4) },
    { t: 0.25, rgb: rgb(79, 18, 123) },
    { t: 0.5, rgb: rgb(182, 54, 121) },
    { t: 0.75, rgb: rgb(251, 140, 60) },
    { t: 1, rgb: rgb(252, 253, 191) },
  ]),
  turbo: Object.freeze([
    { t: 0, rgb: rgb(48, 18, 59) },
    { t: 0.25, rgb: rgb(63, 128, 234) },
    { t: 0.5, rgb: rgb(34, 201, 169) },
    { t: 0.75, rgb: rgb(246, 189, 39) },
    { t: 1, rgb: rgb(122, 4, 3) },
  ]),
  grayscale: Object.freeze([
    { t: 0, rgb: rgb(0, 0, 0) },
    { t: 1, rgb: rgb(255, 255, 255) },
  ]),
});
