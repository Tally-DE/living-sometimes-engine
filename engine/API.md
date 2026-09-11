# Authoring API

Read this with [the engine guide](README.md). These are neutral API fragments, not supplied art or demonstration projects. The typed source is authoritative. A story still needs authored imagery, motion, pacing and sound; the engine provides shared mechanisms.

## Scene lifecycle

```ts
import type { PieceFactory } from '../../core/runtime';
import { Geo } from '../../modules/geometry';
import { camera } from '../../core/renderer';
import { matrix } from '../../core/math';

const create: PieceFactory = (host) => {
  const r = host.renderer;
  const mesh = r.mesh(new Geo().sphere([0, 0, 0], [1, 1, 1]));
  host.scope.own(() => mesh.dispose());
  return {
    render(time) {
      r.begin(time);
      camera(r, { height: 6, centre: [0, 0, 0], eye: [0, 0, 15] });
      r.draw(mesh, matrix([0, 0, 0]), { gain: 1 });
      r.finish(1, { mode: 'ascii' });
    },
  };
};
export default create;
```

`host` includes `renderer`, `glyphs`, `world`, `timeline`, `inputs`, `scope`, `project` and `asset(path)`. `render(time)` receives absolute seconds. Return optional `resize()`, `dispose()` and a `diagnostics` object. Allocate reusable resources in the factory and register cleanup with `host.scope.own(...)`, or dispose them in the piece's `dispose()`. Avoid disposing the same shared resource from unrelated owners.

Use `host.asset(host.project.assets!.source)` for local images and other assets. `loadImage()` and `loadBytes()` in `core/assets.ts` report loading errors. Declare every delivered asset in `project.json`; imports of another project's source are rejected during delivery.

## Geometry, light and presentation

`renderer.mesh(geometry)` creates a persistent handle. `update(handle, geometry)` changes its vertices. `draw(handle, transform?, {gain?})` can draw one mesh many times with independent transforms and light intensity. GPU updates reuse interleaved buffers. Nonuniform scales use inverse-transpose normals in both backends.

Call `begin(time)` before drawing and `finish(fade, presentation)` once after drawing. `fade` is conventionally 0–1. Available presentation settings:

| Mode | Controls |
| --- | --- |
| `ascii` | Default lit glyph rendering |
| `solid` | Solid shaded cells from the same live lighting field |
| `hybrid` | `progress` 0–1 moves from solid cells to glyphs |
| `tear` | `progress` 0–1 reveals solid cells through a moving tear, with a bright edge |
| `glitch` | `amount` 0–1 controls displaced rows and substituted glyphs |

Effects are functions of supplied time. Choose their timing in the scene. These modes never substitute a recording or a photographic frame sequence.

Optional manifest `visual` fields are `cellWidth`, `minColumns`, `maxColumns`, `cellAspect`. They override the selected shared profile. Use a resolution appropriate for the smallest supported viewport; higher density increases work and may make text unreadable.

## Deforming surfaces

```ts
import { ParametricSurface } from '../../modules/parametric';

const surface = new ParametricSurface(
  host.renderer,
  (u, v, bend: number) => [u - .5, v - .5, Math.sin(u * Math.PI) * bend],
  { columns: 18, rows: 24, colour: [.6, .7, .8] },
);
host.scope.own(() => surface.dispose());
// Inside render(time), after renderer.begin(time):
host.renderer.draw(surface.update(.2, 'pose-a'));
```

`SurfaceFunction<P>` returns `[x,y,z]` for `(u,v,parameters)`. Bounds default to `[0,1]`; `u` and `v` options may change them. Colour may be a number, RGB triple, or function of `(u,v,parameters)`. `unlit` bypasses lighting. Smooth normals come from neighbouring samples; increase sampling for tight curvature. Positions and colour must be finite.

`update(parameters, key?)` skips geometry work only when the explicit key equals the previous key. The key must cover **every** changing geometry and colour input. Omit it when uncertain. The cache holds one pose per surface and reverse seeks rebuild the requested pose. Use one surface for each independently deforming object, and use draw transforms when several objects share the same pose.

`parametricGeometry()` produces standalone geometry; `surfaceWire()` produces a tube grid over the same function. Shape definitions, skin patterns, growth, attachment and release choreography belong in private scene code.

## Text and glyph particles

`bitmapText(text, font, options, output?)` in `modules/text-geometry.ts` appends lit, depth-tested text made from boxes. Supply a font mapping characters to arrays of binary row strings, for example `{X:['101','010','101']}`. Options include `position`, `size`, `colour`, `align`, `advance`, `space`, `fill`, `depth`. Cached glyph geometry is bounded. This is intended for small geometric alphabets; it is not a general Unicode font shaper.

For screen typography use `host.glyphs` and `modules/typography.ts`; for moving particles use `GlyphSprites` and `textPoints` in `modules/glyph-sprites.ts`. `textPoints([{text,x,y,size,at}], {width,height,step,left,right})` returns deterministic positions sampled from browser text. `GlyphSprites.draw(context,index,x,y,width,height)` draws a cached glyph. Use seeded `rng()` for destinations and derive motion from absolute time. Dispose each sprite atlas.

## Live image composition

`CanvasAscii` in `modules/canvas-ascii.ts` presents a **live source canvas** through glyphs. Construct it with the stage element, register disposal, call `resize()` from the piece's `resize()`, then in each frame:

```ts
presenter.begin();
// Compose original source art and procedural drawing into your own canvas here.
presenter.present(sourceCanvas, {
  crop: { x: 0, y: 0, w: sourceCanvas.width, h: sourceCanvas.height },
  definition: .7,
  time,
  fade: 1,
});
```

`definition` 0–1 moves from coarse, disturbed glyphs to dense, area-filtered glyphs. `columns` optionally fixes the grid. `frame(crop)` supplies the fitted destination rectangle. `context` is available for live particle overlays; `grid` reports actual glyph counts. Canvas composition uses its own resolution and presentation options; the studio's geometry camera/exposure/density controls do not automatically alter a custom canvas composition. Map any artistic controls explicitly through the manifest and `host.inputs`.

Clear your source each frame, including transparent regions. For repeatedly rebuilt canvas caches, use `getContext('2d', {willReadFrequently:true})` from their creation to keep rasterization consistent during readback verification. Cache by all visual inputs and reconstruct in a stable order on reverse seeks. Test pixels, not just internal state.

`ImageWarp(image,width,height,crop?)` in `modules/image-warp.ts` provides a JavaScript image rig. `render(controls,columns?,rows?)` returns a deformed live canvas. Each control has `centre:[x,y]`, `radius:[rx,ry]`, `offset:[dx,dy]` in source pixels, with a smooth elliptical falloff. Compose that canvas, then pass it through `CanvasAscii`. Large control offsets can fold triangles; use sufficient mesh resolution and inspect your result. Dispose the rig.

For specialized per-pixel deformation, `RasterKernel.load(bytes,width,height)` accepts a **local author-supplied WebAssembly program**, with no imports. Required exports: `memory`, `init()`, `source_ptr()`, `output_ptr()`, `render(...numericParameters)`. The two pointer functions address RGBA byte buffers of `width*height*4`; `init()` allocates/configures them. Call `setSource(ImageData)`, then `render(parameters)` to get a canvas. The program must completely and deterministically write each output frame. No compiled art-specific programs are distributed with the engine; JavaScript `ImageWarp` needs no compiler or WebAssembly asset.

## Verification and release

Add optional `verification` to a manifest:

```json
{
  "times": [0, 4, 8],
  "ending": "black",
  "compareCpu": true,
  "input": { "name": "bend", "value": 0.5 }
}
```

Times must lie inside the duration and an input must name a declared parameter with a valid value. Omit fields that do not apply. `ending:'hold'` expects the last half-second and final frame to match. `compareCpu` checks a representative foreground frame; it does not certify exact backend parity. Every cue is checked near its start, midpoint and end. Adaptations also receive a two-second timeline sweep. Forward and reverse pixel hashes must agree; failures include times and diagnostics. Performance numbers measure CPU submission rather than GPU completion.

Use **Check this project** while authoring and **Run engine checks** before a shared change is released. Verify the audience player, portrait framing, real playback, score synchronization and intended endings. No test or capture requires a video file. A clean download also runs neutral browser fixtures without any art installed.

Run `npm run check`, then `npm run build -- your-id`. Deliver only that build's `dist/standalone/your-id.html` or `dist/site/`. The HTML embeds its own assets and runtime; the site uses relative local files. The audience player starts sound from a click and provides silent playback. Test the actual build after editing. Keep project files in your own backed-up workspace: this engine repository ignores them by default.

## Troubleshooting and limits

- Empty studio: create a project, then restart `npm run dev`. An empty installation is intentional.
- Port occupied: choose `ENGINE_PORT` (`$env:ENGINE_PORT='4182'` in PowerShell; `ENGINE_PORT=4182 npm run dev` in a POSIX shell).
- Sound does not start: use Play with sound after a click; check the local score path and browser-supported audio format. Scores begin at timeline zero. Silent playback uses a wall clock.
- Missing asset: declare its relative path in the manifest, preserve filename case and rebuild. Do not use a remote URL as an undeclared asset dependency.
- Slow scene: inspect diagnostics, reuse mesh handles, avoid reconstructing text or surfaces unnecessarily, bound caches and reduce sampling only after checking the artistic effect. The CPU fallback may be substantially slower.
- Seek mismatch: remove dependence on previous frame order, unseeded randomness, asynchronous asset arrival, incomplete cache keys or incremental drawing that cannot be reconstructed.
- Browser variation: glyph rasterization and CPU/GPU pixels can differ across machines. Determinism is tested within one backend/session. Orthographic cameras are supported; advanced perspective clipping, multi-stem audio, rig editors and WebGPU remain future shared work.

The engine does not provide story understanding, artistic assets, premade characters, music, automatic choreography, hosting or a finished-piece quality guarantee. Agents author those decisions using these shared services.
