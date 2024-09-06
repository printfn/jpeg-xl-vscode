// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	/**
	 * @param {Uint8Array} initialContent
	 * @return {Promise<HTMLImageElement>}
	 */
	async function loadImageFromData(initialContent) {
		const blob = new Blob([initialContent], { 'type': 'image/png' });
        vscode.postMessage({ type: 'log', body: 'received content size: ' + initialContent.length });
		const url = URL.createObjectURL(blob);
		try {
			const img = document.createElement('img');
			img.crossOrigin = 'anonymous';
			img.src = url;
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	class JXLEditor {
		constructor( /** @type {HTMLElement} */ parent) {
			this.ready = false;

			this.editable = false;

			this._initElements(parent);
		}

		setEditable(editable) {
			this.editable = editable;
		}

		_initElements(/** @type {HTMLElement} */ parent) {
			this.wrapper = document.createElement('div');
			this.wrapper.style.position = 'relative';
			parent.append(this.wrapper);

			this.initialCanvas = document.createElement('canvas');
			this.initialCtx = this.initialCanvas.getContext('2d');
			this.wrapper.append(this.initialCanvas);
		}

		/**
		 * @param {Uint8Array | undefined} data
		 */
		async reset(data) {
			if (data) {
				const img = await loadImageFromData(data);
                if (!this.initialCanvas || !this.initialCtx) {
                    return;
                }
                this.initialCanvas.width = img.naturalWidth;
                this.initialCanvas.height = img.naturalHeight;
				this.initialCtx.drawImage(img, 0, 0);
				this.ready = true;
			}
		}

		async resetUntitled() {
			const size = 100;
            if (!this.initialCanvas || !this.initialCtx) {
                return;
            }
			this.initialCanvas.width = size;
			this.initialCanvas.height = size;

			this.initialCtx.save();
			{
				this.initialCtx.fillStyle = 'white';
				this.initialCtx.fillRect(0, 0, size, size);
			}
			this.initialCtx.restore();
			this.ready = true;
		}

		/** @return {Promise<Uint8Array>} */
		async getImageData() {
			const outCanvas = document.createElement('canvas');
            if (!this.initialCanvas || !this.initialCtx) {
                throw new Error('cannot get image data: no canvas/context');
            }
			outCanvas.width = this.initialCanvas.width;
			outCanvas.height = this.initialCanvas.height;

			const outCtx = outCanvas.getContext('2d');
            if (!outCtx) {
                throw new Error('could not initialise outCtx');
            }
			outCtx.drawImage(this.initialCanvas, 0, 0);

			const blob = await new Promise(resolve => {
				outCanvas.toBlob(resolve, 'image/png');
			});

			return new Uint8Array(await blob.arrayBuffer());
		}
	}

    /** @type HTMLElement | null */
    const canvasDiv = document.querySelector('.canvas');
    if (!canvasDiv) {
        throw new Error('could not query .canvas div');
    }
	const editor = new JXLEditor(canvasDiv);

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					editor.setEditable(body.editable);
					if (body.untitled) {
						await editor.resetUntitled();
						return;
					} else {
						// Load the initial image into the canvas.
						await editor.reset(body.value);
						return;
					}
				}
			case 'update':
				{
					await editor.reset(body.content);
					return;
				}
			case 'getFileData':
				{
					// Get the image data for the canvas and post it back to the extension.
					editor.getImageData().then(data => {
						vscode.postMessage({ type: 'response', requestId, body: Array.from(data) });
					});
					return;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });
}());
