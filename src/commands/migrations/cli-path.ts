declare const process: {
	argv: string[];
	execPath: string;
};

function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Resolve the CLI entrypoint for migration orchestrators.
 *
 * Render does not install a global `gbrain` binary for source runs, so
 * orchestrators must invoke the current CLI directly.
 */
export function migrationCliCommand(): string {
	const arg1 = process.argv[1] ?? '';
	if (arg1.endsWith('/gbrain') || arg1.endsWith('\\gbrain.exe')) {
		return shellQuote(arg1);
	}
	if (arg1.endsWith('.ts') || arg1.endsWith('.mjs') || arg1.endsWith('.js')) {
		return `bun run ${shellQuote(arg1)}`;
	}
	if (process.execPath.endsWith('/gbrain') || process.execPath.endsWith('\\gbrain.exe')) {
		return shellQuote(process.execPath);
	}
	return 'gbrain';
}