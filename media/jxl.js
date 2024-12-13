// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-expect-error
	const vscode = acquireVsCodeApi();

	function log(/** @type string */ message) {
		vscode.postMessage({ type: 'log', body: message });
	}

	/**
	 * @param {Uint8Array} initialContent
	 * @return {Promise<HTMLImageElement>}
	 */
	async function loadImageFromData(initialContent) {
		const blob = new Blob([initialContent], { type: 'image/png' });
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
		constructor(/** @type {HTMLElement} */ parent) {
			this._initElements(parent);
		}

		_initElements(/** @type {HTMLElement} */ parent) {
			this.wrapper = document.createElement('div');
			this.wrapper.style.position = 'relative';
			parent.append(this.wrapper);

			this.canvas = document.createElement('canvas');
			this.canvas.style.display = 'unset';
			this.ctx = this.canvas.getContext('2d');

			this.errorText = document.createElement('h2');
			this.errorText.id = 'error-message';
			this.errorText.style.display = 'none';

			this.wrapper.append(this.errorText);
			this.wrapper.append(this.canvas);
		}

		/**
		 * @param {import('../src/decoder').DecodedImage} image
		 */
		async reset(image) {
			if (!this.canvas || !this.ctx || !this.errorText) {
				return;
			}
			if (image.png) {
				this.canvas.style.display = 'unset';
				this.errorText.style.display = 'none';
				const img = await loadImageFromData(image.png);
				this.canvas.width = img.naturalWidth;
				this.canvas.height = img.naturalHeight;
				this.ctx.drawImage(img, 0, 0);

				// this.intervalId = setInterval(() => {
				// 	if (!this.canvas) {
				// 		return;
				// 	}
				// 	log('scaling factor w: ' + this.canvas.offsetWidth / this.canvas.width * 100);
				// 	log('scaling factor h: ' + this.canvas.offsetHeight / this.canvas.height * 100);
				// }, 1000);
			} else {
				this.canvas.style.display = 'none';
				this.errorText.style.display = 'unset';
				this.errorText.innerHTML = `JPEG XL: ${image.error ?? 'Unknown error'}`;
			}
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
		const { type, body } = e.data;
		switch (type) {
			case 'update': {
				await editor.reset(body.content);
				return;
			}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });
})();
