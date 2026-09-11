# Engine guide

The engine is primarily used through source files and command-line tools. The studio provides live visual inspection for agents and people.

## Project contract

From the repository root, run `npm --prefix engine run new -- story-id "Story Title"`. The generated project contains `story.md`, `project.json`, `scene.ts` and an assets directory. The scene is intentionally empty; add your own story. Its files stay local and are ignored by this repository's Git configuration. The reusable scaffold lives in `templates/blank/`.

`core/project.ts` validates schema version 1 / engine version 1.1.0 (also accepting existing 1.0.0 projects): duration in seconds, seed, visual profile, local asset paths, named cue intervals, artistic settings and optional numeric parameters. Scores start at timeline zero; include leading silence in the asset. Nonzero score offsets are rejected in this release.

`scene.ts` exports a `PieceFactory` from `core/runtime.ts`. It receives a host with `renderer`, `glyphs`, `world`, `timeline`, `inputs`, `scope`, `project` and an asset URL resolver. Return `render(time)`, with optional `resize()`, `dispose()` and diagnostics. Frames must be reproducible when requested out of order.

Create mesh handles once. Use `renderer.begin(time)`, the common camera helper, geometry updates and `draw()`, then `finish(fade, presentation)`. One geometry handle can be drawn at several transforms. Dispose of project-owned handles when the scene closes. Do not make a private player or renderer.

See [the authoring API](API.md) for examples, every new capability, verification settings and troubleshooting.

## Shared modules

| Location | Responsibility |
| --- | --- |
| `core/runtime.ts`, `audio.ts` | Playback, audio clock, seek, rate, loops, frame stepping, waveform and lifecycle |
| `core/renderer.ts`, `gpu-renderer.ts`, `cpu-renderer.ts`, `profiles.ts` | Common geometry contract, camera, GPU ASCII pipeline and CPU reference |
| `core/world.ts` | Persistent objects, hierarchy, attachments and resource ownership |
| `core/timeline.ts`, `math.ts` | Cues, tracks, input replay, bounded fixed-step checkpoints and seeded math |
| `modules/geometry.ts` | Procedural spheres, boxes, tubes, curves and surfaces |
| `modules/behaviour.ts` | Reach/contact, planted stance, paths, breathing and deformation |
| `modules/typography.ts` | Words composed directly from glyphs or smaller words |
| `modules/parametric.ts`, `text-geometry.ts` | Cached deformable surfaces, wire sampling and 3D text |
| `core/presentation.ts` | Shared solid, hybrid, tear and glitch presentation |
| `modules/canvas-ascii.ts`, `image-warp.ts`, `raster-kernel.ts`, `glyph-sprites.ts` | Live image composition, deformation, glyph filtering and particles |
| `modules/image-surface.ts` | Static image samples mapped onto live deformable geometry |
| `studio/player.ts` | Audience player shared by all builds |

The GPU renders geometry into a small lighting buffer, chooses glyphs and presents their atlas. Artistic character density is independent of display pixel ratio, which is capped at 2. Playback requests at most 30 rendered frames per second while audio remains the timing authority. Frame diagnostics measure CPU/JavaScript submission, not total GPU execution or guaranteed frame rate.

The CPU renderer supports orthographic scenes. Arbitrary perspective near-plane clipping and perspective-correct interpolation require a shared upgrade. Dense scenes are slower on CPU; browser font rasterization also varies across machines.

## Studio and delivery

`npm --prefix engine run dev` starts the local studio at http://127.0.0.1:4177/. Set `ENGINE_PORT` to choose another port. It supports project selection, cue navigation, scrubbing, audio waveform, play/pause/replay, silent play, mute, speed, frame stepping, loops, portrait framing, exposure/density, story editing and saved settings.

Camera presets are authored framing, wider and closer views. Actual camera paths remain code-authored. Paused parameter changes edit saved base values. Changes made during playback become session inputs; the API can serialize/restore that history, but the studio does not save it to a manifest.

`npm --prefix engine run check` generates the registry, type-checks, builds, runs tests and checks live-only outputs. The **Run engine checks** button (or **Check this project** while authoring) verifies native rendering, backward seeks and removal of runtime canvases, plus shared geometry reuse. An empty installation still builds the engine and runs a synthetic renderer diagnostic; it needs no demonstration projects. Blank drafts may have zero visible pixels. Inspect real animation and sound as well; these checks do not establish artistic quality.

`npm --prefix engine run build -- story-id` creates `engine/dist/standalone/story-id.html`, a live static site and license notices. Each delivered piece contains only its own scene and declared assets; cross-project source imports fail the build. All runtime dependencies are bundled. Generated output is replaced on each build and is excluded from Git.

The public distribution has no original-archive manifest and reports `archiveStatus: "not-configured"`. A private workspace may provide `references/original-html-hashes.json`; if originals are present, the entire archive must match. Once verified, `.local/archive-required` keeps that requirement in force. `npm run policy:archive` explicitly requires it.

## Extending the engine

Start from a concrete story need. Put generally reusable capabilities in core/modules, retain the artistic decisions in the scene, and verify affected projects. Add a regression test that covers the behaviour. Keep versions compatible or migrate manifests explicitly. Richer rigs, multiple audio stems, WebGPU and more elaborate editing remain future shared capabilities.
