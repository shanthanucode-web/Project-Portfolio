import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { ACCELERATION, MOVE_SPEED, TURN_SPEED, WORLD_BOUNDS } from '../game/constants';

export function RoverRobot({ inputRef, mobileInputRef, robotPositionRef, onMove, mood = 'idle' }) {
  const body = useRef(null);
  const group = useRef(null);
  const treadRollers = useRef([]);
  const head = useRef(null);
  const leftEye = useRef(null);
  const rightEye = useRef(null);
  const eyeRig = useRef(null);
  const position = useRef(new THREE.Vector3(0, 0.55, 3));
  const heading = useRef(Math.PI);
  const currentSpeed = useRef(0);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const nextPosition = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useFrame((state, delta) => {
    const keyboard = inputRef.current;
    const mobile = mobileInputRef.current;
    const driveY = Number(keyboard.backward) - Number(keyboard.forward) - mobile.y;
    const driveX = Number(keyboard.right) - Number(keyboard.left) + mobile.x;
    const inputMagnitude = Math.min(1, Math.hypot(driveX, driveY));
    const moving = inputMagnitude > 0.04;
    const targetSpeed = moving ? MOVE_SPEED * inputMagnitude : 0;
    currentSpeed.current = THREE.MathUtils.damp(currentSpeed.current, targetSpeed, ACCELERATION, delta);

    if (moving) {
      const targetHeading = Math.atan2(driveX, driveY);
      let diff = targetHeading - heading.current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading.current += diff * Math.min(1, TURN_SPEED * delta);

      velocity.set(Math.sin(targetHeading), 0, Math.cos(targetHeading)).normalize();
      nextPosition.copy(position.current).addScaledVector(velocity, currentSpeed.current * delta);
      nextPosition.x = THREE.MathUtils.clamp(nextPosition.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
      nextPosition.z = THREE.MathUtils.clamp(nextPosition.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
      position.current.copy(nextPosition);
    }

    euler.set(0, heading.current, 0);
    quaternion.setFromEuler(euler);
    body.current?.setNextKinematicTranslation(position.current);
    body.current?.setNextKinematicRotation(quaternion);

    const elapsed = state.clock.elapsedTime;
    const speedFactor = currentSpeed.current / MOVE_SPEED;
    const celebrateBob = mood === 'celebrate' ? Math.sin(elapsed * 18) * 0.08 + 0.08 : 0;
    const bob = Math.sin(elapsed * 6) * (speedFactor * 0.04 + 0.01) + celebrateBob;
    if (group.current) {
      group.current.position.y = bob;
      group.current.rotation.z = Math.sin(elapsed * 8) * speedFactor * 0.035;
    }
    for (const roller of treadRollers.current) {
      if (roller) roller.rotation.x -= delta * (speedFactor * 12 + 0.5);
    }
    if (head.current) {
      const lookAmount = mood === 'near' ? 0.28 : 0.11;
      head.current.rotation.y = Math.sin(elapsed * 1.5) * lookAmount + driveX * 0.08;
      head.current.rotation.x = -0.08 + Math.sin(elapsed * 2.1) * 0.035 - speedFactor * 0.04;
      head.current.position.y = 0.98 + (mood === 'celebrate' ? Math.max(0, Math.sin(elapsed * 16)) * 0.08 : 0);
    }
    if (eyeRig.current) {
      eyeRig.current.rotation.y = moving ? driveX * 0.12 : 0;
    }
    const blinkWindow = elapsed % 4.1;
    const blinkScale = mood === 'near' ? 1.16 : blinkWindow > 3.88 ? 0.16 : 1;
    const eyeScale = mood === 'near' ? 1.12 : 1;
    [leftEye.current, rightEye.current].forEach((eye) => {
      if (!eye) return;
      eye.scale.set(eyeScale, blinkScale, eyeScale);
    });

    robotPositionRef.current = { x: position.current.x, z: position.current.z };
    onMove(robotPositionRef.current);
  });

  const eyeColor = mood === 'celebrate' ? '#ffd27a' : mood === 'near' ? '#effff0' : '#e7fff4';
  const eyeEmissive = mood === 'celebrate' ? '#ffb347' : '#86efac';
  const eyeGlow = mood === 'celebrate' ? 1.8 : mood === 'near' ? 1.35 : 0.9;

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, 0.55, 3]}
      enabledRotations={[false, true, false]}
    >
      <CuboidCollider args={[0.65, 0.45, 0.8]} />
      <group ref={group} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.9, 0.7]} />
          <meshStandardMaterial color="#5f633c" roughness={0.78} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.3, -0.362]} castShadow>
          <boxGeometry args={[0.46, 0.34, 0.035]} />
          <meshStandardMaterial color="#273027" roughness={0.7} metalness={0.12} />
        </mesh>
        <mesh position={[0, 0.37, -0.384]}>
          <boxGeometry args={[0.34, 0.045, 0.018]} />
          <meshStandardMaterial color="#86efac" emissive="#4ade80" emissiveIntensity={mood === 'near' ? 0.45 : 0.16} roughness={0.45} />
        </mesh>
        <mesh position={[0, -0.18, -0.18]} castShadow>
          <boxGeometry args={[0.52, 0.18, 0.22]} />
          <meshStandardMaterial color="#454b35" roughness={0.84} />
        </mesh>

        <group ref={head} position={[0, 0.98, -0.08]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.58, 0.32, 0.38]} />
            <meshStandardMaterial color="#626642" roughness={0.72} metalness={0.1} />
          </mesh>
          <group ref={eyeRig} position={[0, 0.05, -0.28]}>
            <EyeUnit position={[-0.23, 0, 0]} lensRef={leftEye} eyeColor={eyeColor} eyeEmissive={eyeEmissive} eyeGlow={eyeGlow} />
            <EyeUnit position={[0.23, 0, 0]} lensRef={rightEye} eyeColor={eyeColor} eyeEmissive={eyeEmissive} eyeGlow={eyeGlow} />
            <mesh position={[0, 0, 0.05]} castShadow>
              <boxGeometry args={[0.24, 0.08, 0.08]} />
              <meshStandardMaterial color="#3d4434" roughness={0.75} />
            </mesh>
          </group>
        </group>

        <TreadAssembly
          position={[-0.52, -0.12, 0]}
          registerRoller={(index, node) => {
            treadRollers.current[index] = node;
          }}
          rollerOffset={0}
        />
        <TreadAssembly
          position={[0.52, -0.12, 0]}
          registerRoller={(index, node) => {
            treadRollers.current[index] = node;
          }}
          rollerOffset={4}
        />

        <Arm position={[-0.45, 0.34, -0.06]} side={-1} />
        <Arm position={[0.45, 0.34, -0.06]} side={1} />
      </group>
    </RigidBody>
  );
}

function EyeUnit({ position, lensRef, eyeColor, eyeEmissive, eyeGlow }) {
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.14, 0.16, 0.22, 18]} />
        <meshStandardMaterial color="#353b32" roughness={0.52} metalness={0.28} />
      </mesh>
      <mesh ref={lensRef} position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.105, 18, 14]} />
        <meshStandardMaterial color={eyeColor} emissive={eyeEmissive} emissiveIntensity={eyeGlow} roughness={0.22} />
      </mesh>
    </group>
  );
}

function TreadAssembly({ position, registerRoller, rollerOffset }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.28, 0.34, 1.04]} />
        <meshStandardMaterial color="#171b18" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.01, 0]} castShadow>
        <boxGeometry args={[0.32, 0.18, 0.82]} />
        <meshStandardMaterial color="#252a25" roughness={0.88} />
      </mesh>
      {[-0.34, -0.11, 0.12, 0.35].map((z, localIndex) => (
        <mesh
          key={z}
          ref={(node) => registerRoller(rollerOffset + localIndex, node)}
          position={[0, -0.02, z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.105, 0.105, 0.34, 18]} />
          <meshStandardMaterial color="#373d37" roughness={0.78} metalness={0.16} />
        </mesh>
      ))}
    </group>
  );
}

function Arm({ position, side }) {
  return (
    <group position={position} rotation={[0.22, 0, side * 0.35]}>
      <mesh castShadow>
        <boxGeometry args={[0.12, 0.48, 0.1]} />
        <meshStandardMaterial color="#4e5338" roughness={0.78} />
      </mesh>
      <mesh position={[0, -0.28, -0.04]} castShadow>
        <boxGeometry args={[0.18, 0.08, 0.16]} />
        <meshStandardMaterial color="#33392f" roughness={0.72} />
      </mesh>
    </group>
  );
}
