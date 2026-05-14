import { useMemo } from 'react';
import { Sky } from '@react-three/drei';
import { MeshCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const TERRAIN_WIDTH = 34;
const TERRAIN_DEPTH = 30;
const TERRAIN_SEGMENTS = 96;
const CLEARINGS = [
  [0, 3, 4.3],
  [-8, -4, 5.2],
  [7, -5, 5.1],
  [5.5, 6.8, 5.2],
  [-5.7, -1.2, 2.8],
  [1.8, 2.9, 2.8],
  [-10.7, -2.2, 2.5],
  [-6.2, -6.7, 2.5],
  [-4.9, -3.6, 2.5],
  [8.8, -2.6, 2.5],
  [3.2, 6.2, 2.5],
];

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clearingInfluence(x, z) {
  return CLEARINGS.reduce((strongest, [cx, cz, radius]) => {
    const distance = Math.hypot(x - cx, z - cz);
    return Math.max(strongest, 1 - smoothstep(radius * 0.45, radius, distance));
  }, 0);
}

function terrainHeight(x, z) {
  const nx = Math.abs(x) / (TERRAIN_WIDTH / 2);
  const nz = Math.abs(z) / (TERRAIN_DEPTH / 2);
  const edgeRise = Math.pow(Math.max(nx, nz), 2.2) * 1.15;
  const undulation =
    Math.sin(x * 0.45 + z * 0.22) * 0.18 +
    Math.cos(z * 0.52 - x * 0.14) * 0.14 +
    Math.sin((x + z) * 0.85) * 0.045;
  const flatten = clearingInfluence(x, z);
  const pathFlatten = Math.max(
    0,
    1 - smoothstep(1.7, 3.5, Math.abs(z + 0.06 * x)),
    1 - smoothstep(1.5, 3.2, Math.abs(x - 0.22 * z)),
  );
  const stableGround = Math.max(flatten, pathFlatten * 0.55);

  return THREE.MathUtils.lerp(edgeRise + undulation, edgeRise * 0.22 + undulation * 0.2, stableGround);
}

export function WorkshopFloor() {
  const terrain = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    const position = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color('#416b32');
    const moss = new THREE.Color('#5f8f3d');
    const earth = new THREE.Color('#6d5a38');

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getY(i);
      const height = terrainHeight(x, z);
      position.setZ(i, height);

      const edge = Math.max(Math.abs(x) / (TERRAIN_WIDTH / 2), Math.abs(z) / (TERRAIN_DEPTH / 2));
      const color = low.clone().lerp(moss, 0.45 + Math.sin(x * 1.7 + z * 0.8) * 0.12);
      color.lerp(earth, THREE.MathUtils.clamp((height - 0.55) * 0.5 + edge * 0.18, 0, 0.42));
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1.1}>
        <MeshCollider type="trimesh">
          <mesh geometry={terrain} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.94} metalness={0.02} />
          </mesh>
        </MeshCollider>
      </RigidBody>
      <mesh position={[0, 0.055, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.12, 0.035, 8, 56]} />
        <meshStandardMaterial color="#7aa65a" roughness={0.8} />
      </mesh>
    </>
  );
}

export function SceneLighting() {
  return (
    <>
      <color attach="background" args={['#cdd7bf']} />
      <fog attach="fog" args={['#9eaa92', 28, 185]} />
      <Sky sunPosition={[100, 20, -100]} turbidity={4.8} rayleigh={1.8} mieCoefficient={0.014} mieDirectionalG={0.82} />
      <ambientLight intensity={0.42} color="#b8d7c1" />
      <hemisphereLight intensity={0.38} color="#d7f0cf" groundColor="#506747" />
      <directionalLight
        castShadow
        position={[12, 8, -10]}
        intensity={2.25}
        color="#ffd08a"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={55}
      />
      <pointLight position={[-8, 2.4, -4]} intensity={1.2} color="#ffb45f" distance={9} />
      <pointLight position={[7, 2.3, -5]} intensity={0.85} color="#ffc36c" distance={8} />
      <pointLight position={[5.5, 2.4, 6.8]} intensity={0.9} color="#ffbc65" distance={8} />
    </>
  );
}
