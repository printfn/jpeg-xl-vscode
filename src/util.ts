export function getNonce() {
	return crypto.randomUUID().replaceAll('-', '');
}

export function formatFileSize(bytes: number) {
	if (bytes === 0) {
		return '0 Bytes';
	}
	if (bytes < 1024) {
		return `${bytes.toString()} Bytes`;
	}

	const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);

	return `${size.toFixed(2)} ${sizes[i]}`;
}
