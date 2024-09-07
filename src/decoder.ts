import init, { JxlImage } from 'jxl-oxide-wasm';
import module from 'jxl-oxide-wasm/module.wasm';

export type DecodedImage = {
    png?: Uint8Array;
    error?: string;
    resolutionX: number;
    resolutionY: number;
};

export async function decode(data: Uint8Array): Promise<DecodedImage> {
    if (data.length === 0) {
        return {
            error: 'File is empty',
            resolutionX: 0,
            resolutionY: 0,
        };
    }
    await init(module);
    const image = new JxlImage();
    image.feedBytes(data);
    if (!image.tryInit()) {
        return {
            error: 'Malformed data',
            resolutionX: 0,
            resolutionY: 0,
        };
    }
    const renderResult = image.render(undefined);
    const png = renderResult.encodeToPng();
    const resolutionX = png[16] << 24 | png[17] << 16 | png[18] << 8 | png[19];
    const resolutionY = png[20] << 24 | png[21] << 16 | png[22] << 8 | png[23];
    return { png, resolutionX, resolutionY };
}
