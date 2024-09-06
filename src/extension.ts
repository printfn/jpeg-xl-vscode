import * as vscode from 'vscode';
import { JXLEditorProvider } from './jpeg-xl-preview.js';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(JXLEditorProvider.register(context));
}

export function deactivate() {}
