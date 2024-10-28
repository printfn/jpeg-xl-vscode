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
		const dataFile =
			typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
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

	public get resolutionString() {
		if (!this._decoded.png) {
			return '';
		}
		return `${this._decoded.resolutionX}x${this._decoded.resolutionY}`;
	}

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		decoded: DecodedImage,
	) {
		super();
		this._uri = uri;
		this._decoded = decoded;
		this._documentData = initialContent;
	}

	public get uri() {
		return this._uri;
	}

	public get decodedImage() {
		return this._decoded;
	}

	public get documentData(): Uint8Array {
		return this._documentData;
	}
}

export class JXLEditorProvider
	implements vscode.CustomReadonlyEditorProvider<JXLDocument>
{
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			JXLEditorProvider.viewType,
			new JXLEditorProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: false,
				},
				supportsMultipleEditorsPerDocument: true,
			},
		);
	}

	private static readonly viewType = 'jpeg-xl.JXLViewer';

	private readonly fileSizeStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100,
	);
	private readonly resolutionStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		101,
	);

	constructor(private readonly context: vscode.ExtensionContext) {
		context.subscriptions.push(
			this.fileSizeStatusBarItem,
			this.resolutionStatusBarItem,
		);
	}

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: { backupId?: string },
		_token: vscode.CancellationToken,
	): Promise<JXLDocument> {
		const document: JXLDocument = await JXLDocument.create(
			uri,
			openContext.backupId,
		);
		return document;
	}

	async resolveCustomEditor(
		document: JXLDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
			enableForms: false,
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

		webviewPanel.onDidChangeViewState(e =>
			this.updateStatusBarItems(e.webviewPanel.active, document),
		);
		webviewPanel.onDidDispose(() => this.updateStatusBarItems(false, document));
		this.updateStatusBarItems(webviewPanel.active, document);
	}

	private updateStatusBarItems(active: boolean, document: JXLDocument) {
		if (active) {
			this.fileSizeStatusBarItem.text = formatFileSize(
				document.documentData.length,
			);
			let bpp = '';
			if (
				document.decodedImage.resolutionX > 0 &&
				document.decodedImage.resolutionY > 0
			) {
				bpp = (
					(document.documentData.length * 8) /
					document.decodedImage.resolutionX /
					document.decodedImage.resolutionY
				).toFixed(3);
				bpp = ` (${bpp} bpp)`;
			}
			this.fileSizeStatusBarItem.tooltip = `${document.documentData.length.toLocaleString()} Bytes${bpp}`;
			this.fileSizeStatusBarItem.show();
			if (document.resolutionString) {
				this.resolutionStatusBarItem.text = document.resolutionString;
				this.resolutionStatusBarItem.show();
			} else {
				this.resolutionStatusBarItem.hide();
			}
		} else {
			this.fileSizeStatusBarItem.hide();
			this.resolutionStatusBarItem.hide();
		}
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
		vscode.CustomDocumentEditEvent<JXLDocument>
	>();
	public readonly onDidChangeCustomDocument =
		this._onDidChangeCustomDocument.event;

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'jxl.js'),
		);

		const styleResetUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reset.css'),
		);

		const styleVSCodeUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vscode.css'),
		);

		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'jxl.css'),
		);

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */ `
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

	private postMessage(
		panel: vscode.WebviewPanel,
		type: string,
		body: any,
	): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage(document: JXLDocument, message: any) {
		switch (message.type) {
			case 'log':
				console.log(message.body);
				break;
			case 'ready':
				break;
			default:
				console.error('unknown message', message);
				break;
		}
	}
}
