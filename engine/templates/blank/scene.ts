import type { PieceFactory } from '../../core/runtime';
import { camera } from '../../core/renderer';

/** Empty authoring scaffold. Add your own scene using shared engine modules. */
const create: PieceFactory = (host) => {
  const r = host.renderer;
  return {
    render(time) {
      r.begin(time);
      camera(r, { height: 5, minWidth: 6, centre: [0, 0, 0], eye: [0, 0, 10] });
      r.finish();
    },
  };
};
export default create;
