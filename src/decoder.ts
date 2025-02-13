import init, { JxlImage, version } from 'jxl-oxide-wasm';
import wasmInput from 'jxl-oxide-wasm.wasm';
import { errorToString } from './util';

export type DecoderResult =
	| { ok: true; image: DecodedImage }
	| { ok: false; error: string; jxlOxideVersion?: string };

export type DecodedImage = {
	png: Uint8Array;
	resolutionX: number;
	resolutionY: number;
	jxlOxideVersion: string;
	fileSize: number;
};

export async function decode(data: Uint8Array): Promise<DecoderResult> {
	try {
		await init(wasmInput);
		if (data.length === 0) {
			return {
				ok: false,
				error: 'File is empty',
				jxlOxideVersion: version(),
			};
		}
		const image = new JxlImage();
		image.feedBytes(data);
		if (!image.tryInit()) {
			return {
				ok: false,
				error: 'Malformed data',
				jxlOxideVersion: version(),
			};
		}
		const renderResult = image.render();
		const png = renderResult.encodeToPng();
		const resolutionX =
			(png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
		const resolutionY =
			(png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
		if (resolutionX === 0 || resolutionY === 0) {
			return {
				ok: false,
				error: `invalid image resolution ${resolutionX.toString()}\u00d7${resolutionY.toString()}`,
				jxlOxideVersion: version(),
			};
		}
		return {
			ok: true,
			image: {
				png,
				resolutionX,
				resolutionY,
				jxlOxideVersion: version(),
				fileSize: data.length,
			},
		};
	} catch (e) {
		return {
			ok: false,
			error: errorToString(e),
		};
	}
}
