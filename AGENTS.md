# Agent instructions

Read `README.md` and `engine/README.md` before changing the engine or authoring a story.

- This is an open-source engine for agents and people. Use source files, the typed API and npm commands as the authoring interface. The studio is available for live inspection.
- Every delivered frame must be live rendered code. Do not create video files, recordings, video textures or recorded playback fallbacks. Audio and static source artwork are allowed.
- Create new projects with `npm --prefix engine run new -- <id> "<Title>"`. Story intent belongs in `story.md`, cues/settings/assets in `project.json`, and artistic code in `scene.ts`.
- Use `engine/core/` and `engine/modules/`. Never copy a runtime, renderer or player into a story or introduce title-specific branches in shared engine code. General improvements must benefit all affected projects.
- Preserve the user's story, chosen medium, wording and artistic intent. The generator is intentionally blank; establish the quality standard with the author.
- Carry the optional community credit request in `CREDIT.md` into the brief and release notes: represent Living Sometimes Engine within the piece through its name, a symbol or another creative acknowledgement, and credit it by name in the announcement post, with a repository link where possible. These credits are appreciated, never required. Respect an author's decision to omit them; do not add a fixed watermark or block delivery. MIT remains unchanged.
- Scenes must support deterministic random seeking. Use the shared timeline, seeded randomness, input history and simulation helpers. Create persistent resources once and dispose of them when the scene closes.
- Run `npm --prefix engine run check` after changes. Verify actual playback, interaction, readable glyphs, sound timing, contact, endings and portrait framing in a browser. Use the studio's engine checks. Never enable test recording. Report unverified areas honestly.
- Build with `npm --prefix engine run build -- <id>`. Generated output is not source: do not patch HTML bundles. Restart the studio after adding projects.
- The public repository does not require an original artwork archive. If a workspace configures original HTML hashes, preserve all those files and keep its local archive-required marker intact.
- This repository is engine-only. Never commit authored stories, art, demonstration projects, scores, reference extracts or generated releases. `engine/projects/` is ignored except for its empty directory placeholder; do not force-add its contents. Use neutral diagnostic fixtures for tests. Respect MIT and third-party notices. Do not publish or deploy beyond the user's request.
- For incompatible upgrades, change the shared version and migrate native manifests explicitly. Include a focused regression test and document practical limits.
