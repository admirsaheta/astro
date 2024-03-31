import type { TransformResult } from '@astrojs/compiler';
import type { ResolvedConfig } from 'vite';
import type { AstroConfig } from '../../@types/astro.js';

import { fileURLToPath } from 'node:url';
import { transform } from '@astrojs/compiler';
import { normalizePath } from 'vite';
import type { AstroPreferences } from '../../preferences/index.js';
import type { AstroError } from '../errors/errors.js';
import { AggregateError, CompilerError } from '../errors/errors.js';
import { AstroErrorData } from '../errors/index.js';
import { resolvePath } from '../util.js';
import { type PartialCompileCssResult, createStylePreprocessor } from './style.js';
import type { CompileCssResult } from './types.js';

export interface CompileProps {
	astroConfig: AstroConfig;
	viteConfig: ResolvedConfig;
	preferences: AstroPreferences;
	filename: string;
	source: string;
}

export interface CompileResult extends Omit<TransformResult, 'css'> {
	css: CompileCssResult[];
}

export async function compile({
	astroConfig,
	viteConfig,
	preferences,
	filename,
	source,
}: CompileProps): Promise<CompileResult> {
	const cssPartialCompileResults: PartialCompileCssResult[] = [];
	const cssTransformErrors: AstroError[] = [];
	let transformResult: TransformResult;

	try {
		transformResult = await transform(source, {
			compact: astroConfig.compressHTML,
			filename,
			normalizedFilename: normalizeFilename(filename, new URL(astroConfig.root)),
			sourcemap: 'both',
			internalURL: 'astro/compiler-runtime',
			astroGlobalArgs: JSON.stringify(astroConfig.site),
			scopedStyleStrategy: astroConfig.scopedStyleStrategy,
			resultScopedSlot: true,
			transitionsAnimationURL: 'astro/components/viewtransitions.css',
			annotateSourceFile:
				viteConfig.command === 'serve' &&
				astroConfig.devToolbar &&
				astroConfig.devToolbar.enabled &&
				(await preferences.get('devToolbar.enabled')),
			renderScript: astroConfig.experimental.directRenderScript,
			preprocessStyle: createStylePreprocessor({
				filename,
				viteConfig,
				cssPartialCompileResults,
				cssTransformErrors,
			}),
			async resolvePath(specifier) {
				return resolvePath(specifier, filename);
			},
		});
	} catch (err: any) {
		// The compiler should be able to handle errors by itself, however
		// for the rare cases where it can't let's directly throw here with as much info as possible
		throw new CompilerError({
			...AstroErrorData.UnknownCompilerError,
			message: err.message ?? 'Unknown compiler error',
			stack: err.stack,
			location: {
				file: filename,
			},
		});
	}

	handleCompileResultErrors(transformResult, cssTransformErrors);

	return {
		...transformResult,
		css: transformResult.css.map((code, i) => ({
			...cssPartialCompileResults[i],
			code,
		})),
	};
}

function handleCompileResultErrors(result: TransformResult, cssTransformErrors: AstroError[]) {
	// TODO: Export the DiagnosticSeverity enum from @astrojs/compiler?
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
	const compilerError = result.diagnostics.find((diag) => diag.severity === 1);

	if (compilerError) {
		throw new CompilerError({
			name: 'CompilerError',
			message: compilerError.text,
			location: {
				line: compilerError.location.line,
				column: compilerError.location.column,
				file: compilerError.location.file,
			},
			hint: compilerError.hint,
		});
	}

	switch (cssTransformErrors.length) {
		case 0:
			break;
		case 1: {
			throw cssTransformErrors[0];
		}
		default: {
			throw new AggregateError({
				...cssTransformErrors[0],
				errors: cssTransformErrors,
			});
		}
	}
}

function normalizeFilename(filename: string, root: URL) {
	const normalizedFilename = normalizePath(filename);
	const normalizedRoot = normalizePath(fileURLToPath(root));
	if (normalizedFilename.startsWith(normalizedRoot)) {
		return normalizedFilename.slice(normalizedRoot.length - 1);
	} else {
		return normalizedFilename;
	}
}
