import { Object3D, Vector3 } from 'three';
import type { Vec3 } from './math';
export class World {
  readonly root = new Object3D();
  private objects = new Map<string, Object3D>();
  create(id: string, parent?: string) {
    if (this.objects.has(id)) throw Error(`Duplicate object: ${id}`);
    const node = new Object3D();
    node.name = id;
    (parent ? this.get(parent) : this.root).add(node);
    this.objects.set(id, node);
    return node;
  }
  get(id: string) {
    const node = this.objects.get(id);
    if (!node) throw Error(`Unknown object: ${id}`);
    return node;
  }
  move(id: string, position: Vec3) {
    this.get(id).position.set(...position);
    this.root.updateMatrixWorld(true);
  }
  attach(id: string, parent?: string) {
    const node = this.get(id),
      target = parent ? this.get(parent) : this.root;
    for (let p: Object3D | null = target; p; p = p.parent)
      if (p === node) throw Error('Attachment would create a cycle.');
    this.root.updateMatrixWorld(true);
    target.attach(node);
    this.root.updateMatrixWorld(true);
  }
  position(id: string): Vec3 {
    this.root.updateMatrixWorld(true);
    return this.get(id).getWorldPosition(new Vector3()).toArray() as Vec3;
  }
  describe() {
    return [...this.objects].map(([id, n]) => ({
      id,
      parent: n.parent === this.root ? null : n.parent?.name,
      position: this.position(id),
    }));
  }
  clear() {
    this.root.clear();
    this.objects.clear();
  }
}
export class ResourceScope {
  private disposers: Array<() => void> = [];
  private closed = false;
  own(dispose: () => void) {
    if (this.closed) throw Error('Scope is disposed.');
    this.disposers.push(dispose);
    return dispose;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    const errors = [];
    for (const d of this.disposers.reverse())
      try {
        d();
      } catch (e) {
        errors.push(e);
      }
    this.disposers = [];
    if (errors.length) throw new AggregateError(errors, 'Resource cleanup failed.');
  }
  get size() {
    return this.disposers.length;
  }
}
