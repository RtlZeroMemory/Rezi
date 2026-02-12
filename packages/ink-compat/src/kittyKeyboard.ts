// Kitty keyboard protocol flags and types.
// Mirrors Ink v6.7.0 at 135cb23ae3b7ca94918b1cd913682f6356f12c5c.

export const kittyFlags = {
	disambiguateEscapeCodes: 1,
	reportEventTypes: 2,
	reportAlternateKeys: 4,
	reportAllKeysAsEscapeCodes: 8,
	reportAssociatedText: 16,
} as const;

export type KittyFlagName = keyof typeof kittyFlags;

export function resolveFlags(flags: KittyFlagName[]): number {
	let result = 0;
	for (const flag of flags) {
		// eslint-disable-next-line no-bitwise
		result |= kittyFlags[flag];
	}

	return result;
}

export const kittyModifiers = {
	shift: 1,
	alt: 2,
	ctrl: 4,
	super: 8,
	hyper: 16,
	meta: 32,
	capsLock: 64,
	numLock: 128,
} as const;

export type KittyKeyboardOptions = {
	mode?: "auto" | "enabled" | "disabled";
	flags?: KittyFlagName[];
};

