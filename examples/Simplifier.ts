import { Main, PerspectiveCameraAuto } from '@three.ez/main';
import { simplifyGeometry, simplifyReady, type SimplifyGeometryParams } from '@three.ez/simplify-geometry';
import { AmbientLight, DirectionalLight, Mesh, Scene } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Pane } from 'tweakpane';

await simplifyReady();

const main = new Main();

const glb = await new GLTFLoader().loadAsync('https://threejs.org/examples/models/gltf/Soldier.glb');
const soldierGroup = glb.scene.children[0];
const dummy = soldierGroup.children[0] as Mesh;

const originalGeometry = dummy.geometry.rotateX(Math.PI / -2).rotateY(Math.PI);
const mesh = new Mesh(originalGeometry, dummy.material);
mesh.scale.divideScalar(40);

const params: SimplifyGeometryParams = {
  ratio: 0,
  error: 0,
  errorAbsolute: false,
  lockBorder: false,
  prune: false,
  sparse: false,
  regularize: false,
  regularizeLight: false,
  permissive: false,
  preserveFolds: false,
  errorClamped: false
};

const attributeWeights = { normal: 0, uv: 0 };
const stats = { error: 0, triangles: (originalGeometry.index?.count ?? 0) / 3 };

const pane = new Pane();
pane.on('change', onChange);
pane.addBinding(params, 'ratio', { min: 0, max: 1, step: 0.001 });
pane.addBinding(params, 'error', { min: 0, max: 1, step: 0.001 });
pane.addBinding(params, 'errorAbsolute');
pane.addBinding(params, 'lockBorder');
pane.addBinding(params, 'prune');
pane.addBinding(params, 'sparse');
pane.addBinding(params, 'regularize');
pane.addBinding(params, 'regularizeLight');
pane.addBinding(params, 'permissive');
pane.addBinding(params, 'preserveFolds');
pane.addBinding(params, 'errorClamped');
pane.addBinding(attributeWeights, 'normal', { label: 'normalWeight', min: 0, max: 2, step: 0.01 });
pane.addBinding(attributeWeights, 'uv', { label: 'uvWeight', min: 0, max: 2, step: 0.01 });
pane.addBinding(stats, 'error', { readonly: true, format: (value: number) => value.toExponential(3) });
pane.addBinding(stats, 'triangles', { readonly: true, format: (value: number) => value.toFixed(0) });

const scene = new Scene().add(mesh).activeSmartRendering();
const camera = new PerspectiveCameraAuto(50).translateZ(10);
const controls = new OrbitControls(camera, main.renderer.domElement);
controls.update();
main.createView({ scene, camera });

function onChange(): void {
  params.attributes = { normal: attributeWeights.normal, uv: attributeWeights.uv };
  const result = simplifyGeometry(originalGeometry, params);

  if (mesh.geometry !== originalGeometry) mesh.geometry.dispose();
  mesh.geometry = result.geometry;
  stats.error = result.error;
  stats.triangles = (result.geometry.index?.count ?? 0) / 3;
  scene.needsRender = true;
}

scene.add(new AmbientLight());
const dirLight = new DirectionalLight('white', 2);
camera.add(dirLight, dirLight.target);
