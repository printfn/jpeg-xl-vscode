import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose.js';
import { formatFileSize, getNonce } from './util.js';
import { decode, type DecodedImage } from './decoder.js';

/**
 * Define the document (the data model) used for JPEG XL files.
 */
class JXLDocument extends Disposable implements vscode.CustomDocument {
	static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
	): Promise<JXLDocument | PromiseLike<JXLDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await JXLDocument.readFile(dataFile);
		const decoded = await decode(fileData);
		return new JXLDocument(uri, fileData, decoded);
	}

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const result = await vscode.workspace.fs.readFile(uri);
		return new Uint8Array(result);
	}

	private readonly _uri: vscode.Uri;

	private _documentData: Uint8Array;

	private readonly _decoded: DecodedImage;

	public get resolutionString() { return `${this._decoded.resolutionX}x${this._decoded.resolutionY}`; }

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		decoded: DecodedImage
	) {
		super();
		this._uri = uri;
		this._decoded = decoded;
		this._documentData = initialContent;
	}

	public get uri() { return this._uri; }

	public get decodedImage() { return this._decoded; }

	public get documentData(): Uint8Array { return this._documentData; }

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	/**
	 * Called by VS Code when there are no more references to the document.
	 *
	 * This happens when all editors for it have been closed.
	 */
	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}
}

export class JXLEditorProvider implements vscode.CustomReadonlyEditorProvider<JXLDocument> {
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			JXLEditorProvider.viewType,
			new JXLEditorProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: false,
				},
				supportsMultipleEditorsPerDocument: true,
			});
	}

	private static readonly viewType = 'jpeg-xl.JXLViewer';

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();
	private readonly fileSizeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	private readonly resolutionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);

	constructor(
		private readonly context: vscode.ExtensionContext
	) {
		context.subscriptions.push(this.fileSizeStatusBarItem, this.resolutionStatusBarItem);
	}

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: { backupId?: string },
		_token: vscode.CancellationToken
	): Promise<JXLDocument> {
		const document: JXLDocument = await JXLDocument.create(uri, openContext.backupId);
		return document;
	}

	async resolveCustomEditor(
		document: JXLDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(async e => {
			if (e.type === 'ready') {
                this.postMessage(webviewPanel, 'update', {
                    content: document.decodedImage,
                });
			}
		});

		webviewPanel.onDidChangeViewState(e => this.updateStatusBarItems(e.webviewPanel.active, document));
		this.updateStatusBarItems(webviewPanel.active, document);
	}

	private updateStatusBarItems(active: boolean, document: JXLDocument) {
		if (active) {
			this.fileSizeStatusBarItem.text = formatFileSize(document.documentData.length);
			this.fileSizeStatusBarItem.tooltip = `${document.documentData.length.toLocaleString()} Bytes`;
			this.fileSizeStatusBarItem.show();
			this.resolutionStatusBarItem.text = document.resolutionString;
			this.resolutionStatusBarItem.show();
		} else {
			this.fileSizeStatusBarItem.hide();
			this.resolutionStatusBarItem.hide();
		}
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<JXLDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'media', 'jxl.js'));

		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'media', 'reset.css'));

		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'media', 'vscode.css'));

		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'media', 'jxl.css'));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!doctype html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet" />
				<link href="${styleVSCodeUri}" rel="stylesheet" />
				<link href="${styleMainUri}" rel="stylesheet" />

				<title>JPEG XL Viewer</title>
			</head>
			<body>
				<div class="canvas"></div>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();

	private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
		const requestId = this._requestId++;
		const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
		panel.webview.postMessage({ type, requestId, body });
		return p;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage(document: JXLDocument, message: any) {
		switch (message.type) {
			case 'response':
				{
					const callback = this._callbacks.get(message.requestId);
					callback?.(message.body);
					return;
				}
            case 'log':
                console.log(message.body);
                break;
            case 'ready':
                break;
            default:
                console.error('unknown message', message);
		}
	}
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {

	private readonly _webviews = new Set<{
		readonly resource: string;
		readonly webviewPanel: vscode.WebviewPanel;
	}>();

	/**
	 * Get all known webviews for a given uri.
	 */
	public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
		const key = uri.toString();
		for (const entry of this._webviews) {
			if (entry.resource === key) {
				yield entry.webviewPanel;
			}
		}
	}

	/**
	 * Add a new webview to the collection.
	 */
	public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
		const entry = { resource: uri.toString(), webviewPanel };
		this._webviews.add(entry);

		webviewPanel.onDidDispose(() => {
			this._webviews.delete(entry);
		});
	}
}
