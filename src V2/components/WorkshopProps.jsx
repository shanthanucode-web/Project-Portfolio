import { useLayoutEffect, useMemo, useRef } from 'react';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const treeData = [
  [-15, -10.5, 1.15, 0.1], [-12.8, -7.8, 0.92, -0.35], [-15.4, -3.8, 1.3, 0.28],
  [-13.8, 1.6, 1.08, 0.55], [-15.2, 7.5, 1.2, -0.18], [-11.4, 10.8, 0.95, 0.42],
  [-6.8, 11.8, 1.24, -0.22], [-1.8, 12.6, 1.05, 0.32], [3.6, 12.1, 1.28, -0.45],
  [8.8, 11.3, 0.98, 0.2], [13.4, 9.2, 1.16, -0.12], [15.2, 5.2, 1.0, 0.5],
  [14.8, 0.8, 1.34, -0.38], [15.4, -4.2, 1.06, 0.12], [13.2, -8.8, 1.22, 0.46],
  [9.5, -12.2, 1.08, -0.28], [4.8, -12.8, 1.25, 0.18], [-1.5, -12.4, 1.0, -0.5],
  [-6.5, -11.8, 1.18, 0.36], [-10.4, -12.1, 0.9, -0.12], [-12.8, 5.3, 0.88, 0.3],
  [11.2, 2.6, 0.94, -0.34], [-2.9, -8.7, 0.82, 0.48], [10.7, -0.8, 0.86, 0.08],
];

const rockData = [
  [-12.1, -1.1, 0.72, 0.46, 0.58], [-9.8, 7.4, 0.55, 0.4, 0.45], [-3.8, 9.4, 0.82, 0.48, 0.62],
  [2.4, -9.5, 0.62, 0.38, 0.5], [10.8, -7.9, 0.74, 0.44, 0.52], [12.2, 6.7, 0.58, 0.36, 0.44],
  [-1.2, 8.1, 0.5, 0.32, 0.42], [11.8, -2.6, 0.46, 0.3, 0.38], [-12.5, -6.4, 0.6, 0.34, 0.44],
];

const logData = [
  [-11.1, 3.5, 1.8, 0.18, 0.62],
  [2.2, 10.2, 2.1, -0.35, 0.52],
  [12.1, -9.8, 1.65, 0.42, 0.5],
];

const mushroomClusters = [
  [-13.1, -8.4], [-10.8, 9.1], [6.8, 10.1], [12.9, 3.4], [-4.7, -9.8], [9.9, -10.2],
];

const fernData = Array.from({ length: 48 }, (_, index) => {
  const angle = index * 2.39;
  const ring = index % 3 === 0 ? 12.8 : index % 3 === 1 ? 10.6 : 8.8;
  return [
    Math.cos(angle) * ring + Math.sin(index) * 0.7,
    Math.sin(angle) * (ring * 0.82) + Math.cos(index * 0.7) * 0.6,
    (index % 5) * 0.28,
  ];
});

function InstancedPines() {
  const trunkRef = useRef(null);
  const lowerRef = useRef(null);
  const midRef = useRef(null);
  const topRef = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    treeData.forEach(([x, z, scale, rot], index) => {
      dummy.position.set(x, 0.48 * scale, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(0.34 * scale, 0.96 * scale, 0.34 * scale);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, 1.18 * scale, z);
      dummy.scale.set(1.08 * scale, 1.18 * scale, 1.08 * scale);
      dummy.updateMatrix();
      lowerRef.current.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, 1.78 * scale, z);
      dummy.scale.set(0.86 * scale, 1.02 * scale, 0.86 * scale);
      dummy.updateMatrix();
      midRef.current.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, 2.32 * scale, z);
      dummy.scale.set(0.62 * scale, 0.82 * scale, 0.62 * scale);
      dummy.updateMatrix();
      topRef.current.setMatrixAt(index, dummy.matrix);
    });

    [trunkRef, lowerRef, midRef, topRef].forEach((ref) => {
      ref.current.instanceMatrix.needsUpdate = true;
    });
  }, [dummy]);

  return (
    <>
      <instancedMesh ref={trunkRef} args={[null, null, treeData.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.52, 1, 8]} />
        <meshStandardMaterial color="#5b3f25" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={lowerRef} args={[null, null, treeData.length]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#285c33" roughness={0.86} />
      </instancedMesh>
      <instancedMesh ref={midRef} args={[null, null, treeData.length]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#33713a" roughness={0.84} />
      </instancedMesh>
      <instancedMesh ref={topRef} args={[null, null, treeData.length]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#3f813e" roughness={0.82} />
      </instancedMesh>
    </>
  );
}

function TreeColliders() {
  return (
    <>
      {treeData.map(([x, z, scale], index) => (
        <RigidBody key={`tree-collider-${index}`} type="fixed" colliders={false} position={[x, 0, z]}>
          <CylinderCollider args={[0.68 * scale, 0.34 * scale]} position={[0, 0.68 * scale, 0]} />
        </RigidBody>
      ))}
    </>
  );
}

function Rocks() {
  return (
    <>
      {rockData.map(([x, z, sx, sy, sz], index) => (
        <RigidBody key={`rock-${index}`} type="fixed" colliders={false} position={[x, sy * 0.32, z]} restitution={0.2} friction={1}>
          <mesh castShadow receiveShadow scale={[sx, sy, sz]} rotation={[0.08 * index, index * 0.63, -0.05 * index]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color={index % 2 ? '#7d8176' : '#696f68'} roughness={0.95} />
          </mesh>
          <BallCollider args={[Math.max(sx, sz) * 0.72]} position={[0, 0.1, 0]} />
        </RigidBody>
      ))}
    </>
  );
}

function FallenLogs() {
  return (
    <>
      {logData.map(([x, z, length, rot, radius], index) => (
        <RigidBody key={`log-${index}`} type="fixed" colliders={false} position={[x, radius * 0.38, z]} rotation={[0, rot, Math.PI / 2]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[radius * 0.34, radius * 0.42, length, 10]} />
            <meshStandardMaterial color="#4b301f" roughness={0.94} />
          </mesh>
          <CylinderCollider args={[length / 2, radius * 0.38]} />
        </RigidBody>
      ))}
    </>
  );
}

function Mushrooms() {
  return (
    <>
      {mushroomClusters.flatMap(([cx, cz], clusterIndex) =>
        [0, 1, 2, 3].map((item) => {
          const angle = item * 1.75 + clusterIndex * 0.4;
          const x = cx + Math.cos(angle) * (0.18 + item * 0.07);
          const z = cz + Math.sin(angle) * (0.15 + item * 0.06);
          const scale = 0.72 + ((clusterIndex + item) % 3) * 0.15;
          return (
            <group key={`mushroom-${clusterIndex}-${item}`} position={[x, 0.08, z]} scale={scale}>
              <mesh castShadow position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.035, 0.05, 0.16, 8]} />
                <meshStandardMaterial color="#e8d7b6" roughness={0.8} />
              </mesh>
              <mesh castShadow position={[0, 0.18, 0]} scale={[1, 0.45, 1]}>
                <sphereGeometry args={[0.12, 10, 8]} />
                <meshStandardMaterial color={item % 2 ? '#d75b2a' : '#c43f28'} roughness={0.78} />
              </mesh>
            </group>
          );
        }),
      )}
    </>
  );
}

function FernTufts() {
  const ref = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    fernData.forEach(([x, z, rot], index) => {
      dummy.position.set(x, 0.08, z);
      dummy.rotation.set(0.18, rot, 0.55);
      dummy.scale.set(0.08, 0.02, 0.46);
      dummy.updateMatrix();
      ref.current.setMatrixAt(index, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <instancedMesh ref={ref} args={[null, null, fernData.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4f9a46" roughness={0.9} />
    </instancedMesh>
  );
}

export function WorkshopProps() {
  return (
    <>
      <InstancedPines />
      <TreeColliders />
      <Rocks />
      <FallenLogs />
      <Mushrooms />
      <FernTufts />
      <RigidBody type="fixed" colliders={false} position={[0, 0.1, -11.4]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[6.8, 0.2, 0.42]} />
          <meshStandardMaterial color="#51664c" roughness={0.94} />
        </mesh>
        <CuboidCollider args={[3.4, 0.1, 0.21]} />
      </RigidBody>
    </>
  );
}
