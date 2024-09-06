import init, { JxlImage } from 'jxl-oxide-wasm';
import module from 'jxl-oxide-wasm/module.wasm';

export async function decode(data: Uint8Array) {
    await init(module);
    const image = new JxlImage();
    image.feedBytes(data);
    image.tryInit();
    const renderResult = image.render(undefined);
    return renderResult.encodeToPng();
}
