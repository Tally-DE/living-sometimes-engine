import * as THREE from 'three';
import { I } from './math';
import { RendererBase, createAtlas, type AsciiRenderer, type MeshHandle } from './renderer';
import type { Geometry } from '../modules/geometry';
import type { VisualProfile } from './profiles';
const vertex = `attribute vec3 ink;attribute float emission;varying vec3 radiance;
float lighting(vec3 n){n=normalize(n);if(dot(n,vec3(.327,.209,.922))<0.)n=-n;return .16+.73*max(0.,dot(n,vec3(-.476,.661,.582)))+.17*max(0.,dot(n,vec3(.638,.279,-.718)))+.08*pow(1.-abs(dot(n,vec3(.312,.201,.928))),3.);}
uniform bool fullColour;uniform vec3 accent;uniform float exposure;
void main(){vec3 n=mat3(modelMatrix)*normal;float l=emission>1.5?1.:lighting(n);vec3 c=fullColour?ink:(ink.r>ink.g*1.3?accent:vec3(1.))*ink.r;radiance=c*l*exposure;gl_Position=projectionMatrix*modelMatrix*vec4(position,1.);}`;
const fragment = `varying vec3 radiance;void main(){gl_FragColor=vec4(radiance,1.);}`;
const screenVertex = `varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const descriptor = `varying vec2 uvScreen;uniform sampler2D field;uniform vec2 grid;uniform bool fullColour;uniform float densityPower;uniform float brightnessPower;uniform float edgeThreshold;uniform vec3 accent;
float asciiLuminance(vec3 c){return fullColour?dot(c,vec3(.25,.62,.13)):c.r;}
void main(){vec2 cell=floor(uvScreen*grid),at=(cell+.5)/grid;vec3 sum=vec3(0.),peak=vec3(0.);float maxv=0.;
for(int y=0;y<3;y++)for(int x=0;x<3;x++){vec3 c=texture2D(field,(cell+(vec2(float(x),float(y))+.5)/3.)/grid).rgb;sum+=c;float v=asciiLuminance(c);if(v>maxv){maxv=v;peak=c;}}
vec3 colour=sum/9.*.55+peak*.45;float v=asciiLuminance(colour);if(v<.012){gl_FragColor=vec4(0.);return;}
vec2 d=1./grid;float gx=asciiLuminance(texture2D(field,at+vec2(d.x,0.)).rgb)-asciiLuminance(texture2D(field,at-vec2(d.x,0.)).rgb);float gy=asciiLuminance(texture2D(field,at+vec2(0.,d.y)).rgb)-asciiLuminance(texture2D(field,at-vec2(0.,d.y)).rgb);float edge=length(vec2(gx,gy));float idx=floor(clamp(pow(v,densityPower)*14.,1.,14.));
if(v<.16&&edge>edgeThreshold){if(abs(gx)>abs(gy)*1.7)idx=15.;else if(abs(gy)>abs(gx)*1.7)idx=16.;else idx=gx*gy<0.?18.:17.;}
float vig=1.-dot(uvScreen-.5,uvScreen-.5)*.43;float strength=clamp(.20+pow(v,brightnessPower)*.83+edge*.07,0.,1.)*vig;strength=floor(strength*31.+.5)/31.;vec3 tint=fullColour?colour/max(max(colour.r,colour.g),max(colour.b,.0001)):(peak.r>peak.g*1.3?accent:vec3(1.));gl_FragColor=vec4(tint*strength,idx/32.);}`;
const present = `varying vec2 uvScreen;uniform sampler2D cells;uniform sampler2D atlas;uniform vec2 grid;uniform float fade;void main(){vec4 c=texture2D(cells,(floor(uvScreen*grid)+.5)/grid);float idx=floor(c.a*32.+.1);vec2 loc=fract(uvScreen*grid);float ink=texture2D(atlas,vec2((idx+loc.x)/32.,loc.y)).a;gl_FragColor=vec4(mix(vec3(2./255.),c.rgb*247./255.*fade,ink),1.);}`;
export class GpuAsciiRenderer extends RendererBase implements AsciiRenderer {
  readonly backend = 'gpu' as const;
  private gpu: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private view = new THREE.Camera();
  private field: THREE.WebGLRenderTarget;
  private cells: THREE.WebGLRenderTarget;
  private geometry = new THREE.PlaneGeometry(2, 2);
  private material: THREE.ShaderMaterial;
  private select: THREE.ShaderMaterial;
  private present: THREE.ShaderMaterial;
  private screen = new THREE.Mesh();
  private atlas: THREE.CanvasTexture;
  private lost = false;
  private copies = new Map<MeshHandle, THREE.Mesh[]>();
  private uses = new Map<MeshHandle, number>();
  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    this.lost = false;
    this.resize();
  };
  constructor(canvas: HTMLCanvasElement, profile: VisualProfile) {
    super(canvas, profile);
    this.gpu = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.gpu.debug.onShaderError = (gl, _program, _vertex, fragment) => {
      throw Error('ASCII shader failed: ' + gl.getShaderInfoLog(fragment));
    };
    this.gpu.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gpu.setClearColor(0);
    this.field = new THREE.WebGLRenderTarget(3, 3, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.cells = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
    this.atlas = new THREE.CanvasTexture(createAtlas());
    this.atlas.minFilter = THREE.LinearFilter;
    this.atlas.magFilter = THREE.LinearFilter;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.DoubleSide,
      uniforms: {
        fullColour: { value: profile.colour },
        accent: { value: new THREE.Vector3(...profile.accent) },
        exposure: { value: 1 },
      },
      toneMapped: false,
    });
    this.select = new THREE.ShaderMaterial({
      vertexShader: screenVertex,
      fragmentShader: descriptor,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        field: { value: this.field.texture },
        grid: { value: new THREE.Vector2() },
        fullColour: { value: profile.colour },
        densityPower: { value: profile.densityPower },
        brightnessPower: { value: profile.brightnessPower },
        edgeThreshold: { value: profile.edgeThreshold },
        accent: { value: new THREE.Vector3(...profile.accent) },
      },
      toneMapped: false,
    });
    this.present = new THREE.ShaderMaterial({
      vertexShader: screenVertex,
      fragmentShader: present,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        cells: { value: this.cells.texture },
        atlas: { value: this.atlas },
        grid: { value: new THREE.Vector2() },
        fade: { value: 1 },
      },
      toneMapped: false,
    });
    this.screen.geometry = this.geometry;
    this.screen.frustumCulled = false;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.resize();
  }
  resize() {
    this.dimensions();
    this.gpu.setSize(this.canvas.width, this.canvas.height, false);
    this.field.setSize(this.W, this.H);
    this.cells.setSize(...this.grid);
    this.select.uniforms.grid.value.set(...this.grid);
    this.present.uniforms.grid.value.set(...this.grid);
  }
  mesh(g: Geometry) {
    const node = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    node.matrixAutoUpdate = false;
    node.frustumCulled = false;
    this.scene.add(node);
    const handle: MeshHandle = {
      a: new Float32Array(),
      count: 0,
      native: node,
      dispose: () => {
        this.scene.remove(node);
        for (const copy of this.copies.get(handle) ?? []) this.scene.remove(copy);
        this.copies.delete(handle);
        this.uses.delete(handle);
        node.geometry.dispose();
        this.handles.delete(handle);
      },
    };
    this.handles.add(handle);
    this.update(handle, g);
    return handle;
  }
  update(m: MeshHandle, g: Geometry) {
    m.a = new Float32Array(g.a);
    m.count = g.a.length / 10;
    const node = m.native as THREE.Mesh,
      geo = node.geometry as THREE.BufferGeometry;
    const count = Math.max(1, m.count);
    let attr = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!attr || attr.count < count) {
      const size = 2 ** Math.ceil(Math.log2(count));
      geo.dispose();
      node.geometry = new THREE.BufferGeometry();
      for (const [name, components] of [
        ['position', 3],
        ['normal', 3],
        ['ink', 3],
        ['emission', 1],
      ] as const)
        node.geometry.setAttribute(
          name,
          new THREE.BufferAttribute(new Float32Array(size * components), components).setUsage(
            THREE.DynamicDrawUsage,
          ),
        );
    }
    const geometry = node.geometry as THREE.BufferGeometry;
    for (let i = 0; i < m.count; i++) {
      const j = i * 10;
      (geometry.getAttribute('position') as THREE.BufferAttribute).setXYZ(
        i,
        g.a[j],
        g.a[j + 1],
        g.a[j + 2],
      );
      (geometry.getAttribute('normal') as THREE.BufferAttribute).setXYZ(
        i,
        g.a[j + 3],
        g.a[j + 4],
        g.a[j + 5],
      );
      (geometry.getAttribute('ink') as THREE.BufferAttribute).setXYZ(
        i,
        g.a[j + 6],
        g.a[j + 7],
        g.a[j + 8],
      );
      (geometry.getAttribute('emission') as THREE.BufferAttribute).setX(i, g.a[j + 9]);
    }
    for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
    geometry.setDrawRange(0, m.count);
  }
  begin(_t: number) {
    if (this.lost) throw Error('Graphics context was lost. Waiting for the browser to restore it.');
    this.triangles = 0;
    this.draws = 0;
    this.uses.clear();
    for (const m of this.handles) (m.native as THREE.Mesh).visible = false;
    for (const copies of this.copies.values()) for (const copy of copies) copy.visible = false;
  }
  draw(m: MeshHandle, transform: ArrayLike<number> = I()) {
    const base = m.native as THREE.Mesh,
      use = this.uses.get(m) ?? 0;
    this.uses.set(m, use + 1);
    let node = base;
    if (use > 0) {
      const copies = this.copies.get(m) ?? [];
      this.copies.set(m, copies);
      if (!copies[use - 1]) {
        const copy = new THREE.Mesh(base.geometry, this.material);
        copy.matrixAutoUpdate = false;
        copy.frustumCulled = false;
        copies.push(copy);
        this.scene.add(copy);
      }
      node = copies[use - 1];
      node.geometry = base.geometry;
    }
    node.visible = m.count > 0;
    node.matrix.fromArray(Array.from(transform));
    this.triangles += m.count / 3;
    this.draws++;
  }
  finish(fade = 1) {
    this.view.projectionMatrix.fromArray(Array.from(this.vp));
    this.material.uniforms.exposure.value = this.exposure;
    this.gpu.setRenderTarget(this.field);
    this.gpu.render(this.scene, this.view);
    this.screen.material = this.select;
    this.gpu.setRenderTarget(this.cells);
    this.gpu.render(this.screen, this.view);
    this.present.uniforms.fade.value = fade;
    this.screen.material = this.present;
    this.gpu.setRenderTarget(null);
    this.gpu.render(this.screen, this.view);
  }
  dispose() {
    for (const m of [...this.handles]) m.dispose();
    this.field.dispose();
    this.cells.dispose();
    this.material.dispose();
    this.select.dispose();
    this.present.dispose();
    this.atlas.dispose();
    this.geometry.dispose();
    this.gpu.dispose();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
  }
}
