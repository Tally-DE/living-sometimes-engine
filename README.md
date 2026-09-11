# Living Sometimes engine

An open-source engine for stories rendered live as ASCII geometry and typography. Built for agents to author through code, with a local studio for agents and people to inspect the result.

Every frame is computed live. Delivery is HTML and JavaScript, never recorded video.

## Start

Use Node.js 24 and npm:

```sh
git clone https://github.com/Tally-DE/living-sometimes-engine.git
cd living-sometimes-engine
npm --prefix engine ci
npm --prefix engine run check
npm --prefix engine run dev
```

Open http://127.0.0.1:4177/. A fresh clone starts with an empty studio. Create your own project using the command below. The studio offers a live stage, timeline, cues, sound controls, portrait preview, artistic settings and diagnostics.

## Author a story

Agents should read [AGENTS.md](AGENTS.md) and the [engine guide](engine/README.md).

```sh
npm --prefix engine run new -- new-story "New Story"
```

The generator creates a blank scene, with no story or artwork. Edit `engine/projects/new-story/story.md`, `project.json` and `scene.ts`. Scene code uses the shared runtime, renderer, audio transport, geometry, typography, world and behaviour modules. Reusable improvements belong in the engine so every story can benefit. The studio is optional for authoring; source files and commands are the primary interface. Restart it after creating a project.

Your local projects and assets are ignored by this repository's Git configuration. Keep them in your own workspace or separate repository; public engine contributions contain engine code and neutral diagnostic fixtures only.

```sh
npm --prefix engine run check
npm --prefix engine run build -- new-story
```

The build creates a self-contained live HTML in `engine/dist/standalone/` and a static website bundle in `engine/dist/site/`. No server API or CDN is required by a delivered piece. Test from the local server or deploy the static bundle yourself.

## Included

- Shared GPU ASCII rendering and a colour CPU reference/fallback.
- Deterministic seeking, named cues, audio timing, input replay and bounded simulation checkpoints.
- Hierarchical objects, attachments, procedural geometry, direct glyph typography, reach/contact and deformation helpers.
- Static image sampling onto live deformable surfaces.
- Project generator, local studio, shared audience player, tests and CI.

This repository contains only the engine, tooling, documentation, tests and a blank authoring template. It includes no art, stories, demonstration projects, scores or reference extracts. Bring your own stories and assets under suitable terms.

## Give credit

Please credit **Living Sometimes Engine** within your piece, using its name, a symbol or another creative representation, and by name in the announcement post. Link to this repository in the post where possible. How the credit fits your work is up to you. **These credits are entirely optional—appreciated, never required.** The MIT licence is unchanged. See [CREDIT.md](CREDIT.md).

## License and contributions

[MIT](LICENSE). The engine can be used, changed and redistributed, including commercially, subject to the license notice. Third-party code retains its [own notices](THIRD_PARTY_NOTICES.md). Your story and assets can have separate terms.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the shared-upgrade workflow. Current limits, including orthographic CPU fallback and score timing, are documented in the engine guide.
