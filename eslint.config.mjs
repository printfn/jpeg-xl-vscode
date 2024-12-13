// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	{
		ignores: [
			'dist',
			'.vscode-test.mjs',
			'esbuild.mjs',
			'eslint.config.mjs',
			'media',
		],
	},
	{
		files: ['./src/**/*.{js,mjs,ts}'],
	},
	{
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},

		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					selector: 'import',
					format: ['camelCase', 'PascalCase'],
				},
			],
			'@typescript-eslint/promise-function-async': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
				},
			],
		},
	},
);
