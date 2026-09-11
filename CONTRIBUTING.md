# Contributing

Agents and people use the same workflow. Read AGENTS.md, install Node.js 24, run `npm --prefix engine ci`, then `npm --prefix engine run check`.

Make reusable improvements in the shared core/modules. Keep story choices in project files. Include a small reproducible example or regression test for the actual behaviour, and document incompatible changes. Format source with `npm --prefix engine run format`.

Inspect affected projects live, including desktop and portrait framing, seeking, contact, typography, audio timing and endings. Browser tests must never record video. State which checks passed and which were unavailable.

Open a pull request describing the problem, the resulting behaviour and relevant validation. This repository contains the engine only: do not commit artwork, authored stories, demonstration projects, scores, reference extracts, dependencies or build outputs. Keep regression fixtures synthetic and limited to the behaviour being tested. Preserve license notices. Submitted original contributions are intended to be distributed under this repository's MIT license.

When sharing a piece made with the engine, please follow the community request in [CREDIT.md](CREDIT.md): a creative acknowledgement within the piece and a named credit in its announcement post. This does not add conditions to MIT.
