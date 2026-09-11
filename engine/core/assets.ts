/** Decode a local/static image before constructing a scene. No frame-sequence or media playback. */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw Error(`Image could not be decoded: ${url.startsWith('data:') ? 'embedded image' : url}`);
  }
  return image;
}
export async function loadBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Asset could not be loaded (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}
