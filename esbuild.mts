import { context, type Plugin } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const esbuildProblemMatcherPlugin: Plugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd(result => {
			for (const { text, location } of result.errors) {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					const line = location.line.toString();
					const column = location.column.toString();
					console.error(`    ${location.file}:${line}:${column}:`);
				}
			}
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		alias: {
			'jxl-oxide-wasm.wasm': 'jxl-oxide-wasm/module.wasm',
		},
		loader: {
			'.wasm': 'binary',
		},
		plugins: [esbuildProblemMatcherPlugin],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

try {
	await main();
} catch (e) {
	console.error(e);
	process.exit(1);
}
