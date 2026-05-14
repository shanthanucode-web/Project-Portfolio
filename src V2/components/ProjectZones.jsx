import { useRef } from 'react';
import { Billboard, Sparkles, Text, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';

export function ProjectZones({ projects, nearestProject, activeSwitchIds }) {
  return (
    <>
      {projects.map((project) => (
        <ProjectBeacon
          key={project.id}
          project={project}
          isNearest={nearestProject.project?.id === project.id && nearestProject.canInteract}
          activeSwitchIds={activeSwitchIds}
        />
      ))}
    </>
  );
}

function ProjectBeacon({ project, isNearest, activeSwitchIds }) {
  const [x, , z] = project.zonePosition;
  const isCoachNova = project.id === 'coach-nova';
  const powered = isCoachNova && activeSwitchIds.includes('coach-nova-power');

  return (
    <group position={[x, 0, z]}>
      <ArtifactArch isNearest={isNearest} powered={powered} isHero={isCoachNova} />
      <OrganicGroundRing isNearest={isNearest} isHero={isCoachNova} />
      <FloatingParticles isNearest={isNearest} powered={powered} />
      <Billboard position={[0, 2.55, 0]}>
        <Text
          fontSize={isCoachNova ? 0.34 : 0.3}
          maxWidth={3.8}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color="#f3f8ed"
          outlineColor="#20331f"
          outlineWidth={0.03}
        >
          {project.title}
        </Text>
        <Text
          position={[0, -0.42, 0]}
          fontSize={0.17}
          maxWidth={3.2}
          textAlign="center"
          color="#cfe8c8"
          anchorX="center"
          anchorY="middle"
          outlineColor="#20331f"
          outlineWidth={0.02}
        >
          {project.status}
        </Text>
      </Billboard>
      <ProjectHologram project={project} isNearest={isNearest} powered={powered} />
    </group>
  );
}

function ArtifactArch({ isNearest, powered, isHero }) {
  const panel = useRef(null);
  const glow = isNearest ? 1.35 : powered ? 0.95 : isHero ? 0.55 : 0.35;

  useFrame((state) => {
    if (!panel.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.1) * (isNearest ? 0.055 : 0.018);
    panel.current.scale.set(1, pulse, 1);
  });

  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh position={[-1.28, 0.8, -0.48]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 1.6, 0.48]} />
        <meshStandardMaterial color="#6f7468" roughness={0.98} />
      </mesh>
      <CuboidCollider args={[0.21, 0.8, 0.24]} position={[-1.28, 0.8, -0.48]} />
      <mesh position={[1.28, 0.8, -0.48]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 1.6, 0.48]} />
        <meshStandardMaterial color="#777b70" roughness={0.98} />
      </mesh>
      <CuboidCollider args={[0.21, 0.8, 0.24]} position={[1.28, 0.8, -0.48]} />
      <mesh position={[0, 1.72, -0.48]} castShadow receiveShadow>
        <boxGeometry args={[3.05, 0.4, 0.54]} />
        <meshStandardMaterial color="#666d62" roughness={0.96} />
      </mesh>
      <CuboidCollider args={[1.52, 0.2, 0.27]} position={[0, 1.72, -0.48]} />
      <mesh ref={panel} position={[0, 0.98, -0.78]}>
        <boxGeometry args={[1.52, 0.82, 0.08]} />
        <meshStandardMaterial
          color="#16352d"
          emissive={isNearest || powered ? '#4ade80' : '#0f8c5b'}
          emissiveIntensity={glow}
          roughness={0.45}
          metalness={0.18}
        />
      </mesh>
      <mesh position={[0, 0.98, -0.83]}>
        <boxGeometry args={[1.18, 0.08, 0.035]} />
        <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={glow * 0.8} />
      </mesh>
      <mesh position={[0, 0.78, -0.83]}>
        <boxGeometry args={[0.82, 0.055, 0.035]} />
        <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={glow * 0.55} />
      </mesh>
    </RigidBody>
  );
}

function OrganicGroundRing({ isNearest, isHero }) {
  const ring = useRef(null);
  const count = isHero ? 18 : 15;

  useFrame((state) => {
    if (!ring.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.3) * (isNearest ? 0.045 : 0.012);
    ring.current.scale.setScalar(pulse);
  });

  return (
    <group ref={ring} position={[0, 0.08, 0]}>
      {Array.from({ length: count }).map((_, index) => {
        const angle = (index / count) * Math.PI * 2;
        const radius = 2.45 + (index % 3) * 0.04;
        const marker = index % 4 === 0;
        return (
          <group key={index} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
            {marker ? (
              <group>
                <mesh position={[0, 0.07, 0]} castShadow>
                  <cylinderGeometry args={[0.035, 0.045, 0.14, 8]} />
                  <meshStandardMaterial color="#e8d7b6" roughness={0.8} />
                </mesh>
                <mesh position={[0, 0.17, 0]} scale={[1, 0.48, 1]}>
                  <sphereGeometry args={[0.11, 10, 8]} />
                  <meshStandardMaterial
                    color={isNearest ? '#ff8c42' : '#b94d2a'}
                    emissive={isNearest ? '#ff7a24' : '#000000'}
                    emissiveIntensity={isNearest ? 0.35 : 0}
                    roughness={0.76}
                  />
                </mesh>
              </group>
            ) : (
              <mesh castShadow receiveShadow scale={[0.18, 0.1 + (index % 2) * 0.04, 0.14]}>
                <sphereGeometry args={[1, 8, 6]} />
                <meshStandardMaterial
                  color={isNearest ? '#9aa487' : '#6f7869'}
                  emissive={isNearest ? '#4ade80' : '#000000'}
                  emissiveIntensity={isNearest ? 0.14 : 0}
                  roughness={0.96}
                />
              </mesh>
            )}
          </group>
        );
      })}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.46, 0.018, 6, 80]} />
        <meshStandardMaterial
          color={isNearest ? '#86efac' : '#586d52'}
          emissive={isNearest ? '#4ade80' : '#000000'}
          emissiveIntensity={isNearest ? 0.8 : 0}
          roughness={0.68}
        />
      </mesh>
    </group>
  );
}

function FloatingParticles({ isNearest, powered }) {
  return (
    <Sparkles
      count={isNearest ? 42 : 24}
      position={[0, 1.55, 0]}
      scale={[3.4, 2.2, 3.4]}
      size={isNearest ? 3.2 : 2}
      speed={0.35}
      opacity={isNearest || powered ? 0.72 : 0.42}
      color={isNearest || powered ? '#86efac' : '#ffc36c'}
    />
  );
}

function ProjectHologram({ project, isNearest, powered }) {
  const image = project.assets?.prototype || project.assets?.circuit || project.assets?.logo;

  return image ? (
    <ImageHologram image={image} isNearest={isNearest} powered={powered} />
  ) : (
    <GenericEngineeringHologram isNearest={isNearest} />
  );
}

function ImageHologram({ image, isNearest, powered }) {
  const group = useRef(null);
  const texture = useTexture(image);
  const glow = isNearest ? 1.15 : powered ? 0.82 : 0.48;
  const opacity = isNearest ? 0.82 : powered ? 0.68 : 0.54;

  useFrame((state) => {
    if (!group.current) return;
    const time = state.clock.elapsedTime;
    group.current.position.y = 0.98 + Math.sin(time * 1.6) * 0.045;
    group.current.rotation.y = Math.sin(time * 0.75) * 0.08;
    group.current.scale.setScalar(1 + Math.sin(time * 2.2) * (isNearest ? 0.025 : 0.01));
  });

  return (
    <group ref={group} position={[0, 0.98, -0.94]}>
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[1.18, 0.76]} />
        <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.34, 0.9, 0.025]} />
        <meshStandardMaterial
          color="#0f2a24"
          emissive="#4ade80"
          emissiveIntensity={glow * 0.28}
          transparent
          opacity={0.22}
          roughness={0.44}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.49, 0.04]}>
        <boxGeometry args={[1.46, 0.035, 0.035]} />
        <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={glow} transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, -0.49, 0.04]}>
        <boxGeometry args={[1.46, 0.035, 0.035]} />
        <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={glow} transparent opacity={0.75} />
      </mesh>
      {[-0.24, -0.08, 0.08, 0.24].map((y, index) => (
        <mesh key={y} position={[0, y, 0.055]}>
          <boxGeometry args={[1.26 - index * 0.06, 0.012, 0.018]} />
          <meshStandardMaterial color="#d7ffe4" emissive="#86efac" emissiveIntensity={glow * 0.65} transparent opacity={0.22} />
        </mesh>
      ))}
      <mesh position={[0, -0.64, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.47, 0.012, 6, 48]} />
        <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={glow * 0.7} transparent opacity={0.58} />
      </mesh>
    </group>
  );
}

function GenericEngineeringHologram({ isNearest }) {
  const group = useRef(null);
  const glow = isNearest ? 1 : 0.46;

  useFrame((state) => {
    if (!group.current) return;
    const time = state.clock.elapsedTime;
    group.current.position.y = 0.88 + Math.sin(time * 1.7) * 0.04;
    group.current.rotation.y = Math.sin(time * 0.85) * 0.12;
    group.current.scale.setScalar(1 + Math.sin(time * 2.6) * (isNearest ? 0.03 : 0.012));
  });

  return (
    <group ref={group} position={[0, 0.88, -0.92]}>
      <mesh position={[0, 0.34, 0.62]} castShadow receiveShadow>
        <boxGeometry args={[1.22, 0.46, 0.9]} />
        <meshStandardMaterial color="#66705f" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.44, 0.04]}>
        <boxGeometry args={[1.16, 0.68, 0.03]} />
        <meshStandardMaterial color="#102c25" emissive="#4ade80" emissiveIntensity={glow * 0.26} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.44, 0.075]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.36, 0.36, 0.035]} />
        <meshStandardMaterial color="#1f6d52" emissive="#4ade80" emissiveIntensity={glow * 0.55} transparent opacity={0.52} />
      </mesh>
      {[
        [-0.42, 0.62, 0.34, 0.012],
        [0.36, 0.56, 0.28, 0.012],
        [-0.26, 0.36, 0.22, 0.012],
        [0.26, 0.25, 0.42, 0.012],
      ].map(([x, y, width, height], index) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0.1]}>
          <boxGeometry args={[width, height, 0.018]} />
          <meshStandardMaterial color="#d7ffe4" emissive="#86efac" emissiveIntensity={glow * 0.8} transparent opacity={0.62} />
        </mesh>
      ))}
      {[
        [-0.52, 0.2],
        [-0.15, 0.66],
        [0.52, 0.55],
        [0.08, 0.16],
      ].map(([x, y]) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0.12]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={glow} transparent opacity={0.78} />
        </mesh>
      ))}
      <Text position={[0, 1.08, 0.08]} rotation={[-0.18, 0, 0]} fontSize={0.14} maxWidth={1.55} textAlign="center" color="#dcebd3">
        Future Engineering Projects
      </Text>
    </group>
  );
}
