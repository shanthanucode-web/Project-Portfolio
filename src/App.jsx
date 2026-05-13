import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Billboard,
  Box,
  ContactShadows,
  Environment,
  Html,
  RoundedBox,
  Text,
  useTexture,
} from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { projects } from './data/projects';

const MOVE_SPEED = 5.2;
const TURN_SPEED = 8;
const INTERACT_RADIUS = 5;

function useKeyboardInput() {
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    const keyMap = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
    };

    const setKey = (event, isPressed) => {
      const mapped = keyMap[event.code];
      if (!mapped) return;
      keys.current[mapped] = isPressed;
      event.preventDefault();
    };

    const onKeyDown = (event) => setKey(event, true);
    const onKeyUp = (event) => setKey(event, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return keys;
}

function getNearestProject(robotPosition) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const project of projects) {
    const [x, , z] = project.zonePosition;
    const distance = Math.hypot(robotPosition.x - x, robotPosition.z - z);
    if (distance < nearestDistance) {
      nearest = project;
      nearestDistance = distance;
    }
  }

  return {
    project: nearest,
    distance: nearestDistance,
    canInteract: nearestDistance <= INTERACT_RADIUS,
  };
}

function CameraRig({ targetRef }) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const target = targetRef.current;
    if (!target) return;

    desired.set(target.x, 7.5, target.z + 8.5);
    camera.position.lerp(desired, 0.08);
    lookAt.set(target.x, 0.9, target.z);
    camera.lookAt(lookAt);
  });

  return null;
}

function RoverRobot({ inputRef, mobileInputRef, robotPositionRef, onMove }) {
  const body = useRef(null);
  const group = useRef(null);
  const leftTread = useRef(null);
  const rightTread = useRef(null);
  const head = useRef(null);
  const position = useRef(new THREE.Vector3(0, 0.55, 3));
  const heading = useRef(Math.PI);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const nextPosition = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useFrame((state, delta) => {
    const keyboard = inputRef.current;
    const mobile = mobileInputRef.current;
    const driveY = Number(keyboard.forward) - Number(keyboard.backward) + mobile.y;
    const driveX = Number(keyboard.right) - Number(keyboard.left) + mobile.x;
    const moving = Math.abs(driveY) > 0.04 || Math.abs(driveX) > 0.04;

    if (moving) {
      const targetHeading = Math.atan2(driveX, driveY);
      let diff = targetHeading - heading.current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading.current += diff * Math.min(1, TURN_SPEED * delta);

      velocity.set(Math.sin(targetHeading), 0, Math.cos(targetHeading)).normalize();
      nextPosition.copy(position.current).addScaledVector(velocity, MOVE_SPEED * delta);
      nextPosition.x = THREE.MathUtils.clamp(nextPosition.x, -13, 13);
      nextPosition.z = THREE.MathUtils.clamp(nextPosition.z, -10, 11);
      position.current.copy(nextPosition);
    }

    euler.set(0, heading.current, 0);
    quaternion.setFromEuler(euler);
    body.current?.setNextKinematicTranslation(position.current);
    body.current?.setNextKinematicRotation(quaternion);

    const bob = Math.sin(state.clock.elapsedTime * 5) * (moving ? 0.035 : 0.012);
    if (group.current) group.current.position.y = bob;
    if (leftTread.current) leftTread.current.rotation.x -= delta * (moving ? 8 : 0.6);
    if (rightTread.current) rightTread.current.rotation.x -= delta * (moving ? 8 : 0.6);
    if (head.current) {
      head.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.12;
      head.current.rotation.x = -0.08 + Math.sin(state.clock.elapsedTime * 1.8) * 0.03;
    }

    robotPositionRef.current = { x: position.current.x, z: position.current.z };
    onMove(robotPositionRef.current);
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, 0.55, 3]}
      enabledRotations={[false, true, false]}
    >
      <CuboidCollider args={[0.65, 0.45, 0.8]} />
      <group ref={group}>
        <RoundedBox args={[1.25, 0.72, 1.25]} radius={0.13} smoothness={8} position={[0, 0.2, 0]}>
          <meshStandardMaterial color="#f0b13e" roughness={0.72} metalness={0.12} />
        </RoundedBox>
        <RoundedBox args={[1.05, 0.18, 0.72]} radius={0.08} smoothness={8} position={[0, 0.66, 0.02]}>
          <meshStandardMaterial color="#42505a" roughness={0.65} metalness={0.35} />
        </RoundedBox>
        <group ref={head} position={[0, 1.18, -0.08]}>
          <RoundedBox args={[0.98, 0.38, 0.38]} radius={0.12} smoothness={8}>
            <meshStandardMaterial color="#dfe8ea" roughness={0.48} metalness={0.18} />
          </RoundedBox>
          <mesh position={[-0.24, 0.02, -0.21]}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshStandardMaterial color="#1f2933" emissive="#6de7ff" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.24, 0.02, -0.21]}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshStandardMaterial color="#1f2933" emissive="#6de7ff" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, -0.12, -0.22]}>
            <boxGeometry args={[0.32, 0.035, 0.03]} />
            <meshStandardMaterial color="#25313a" />
          </mesh>
        </group>
        <mesh ref={leftTread} position={[-0.78, -0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.36, 24]} />
          <meshStandardMaterial color="#27313a" roughness={0.9} />
        </mesh>
        <mesh ref={rightTread} position={[0.78, -0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.36, 24]} />
          <meshStandardMaterial color="#27313a" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.78, 0.5]}>
          <boxGeometry args={[0.16, 0.42, 0.16]} />
          <meshStandardMaterial color="#53636c" />
        </mesh>
        <mesh position={[0, 1.03, 0.5]}>
          <sphereGeometry args={[0.12, 18, 18]} />
          <meshStandardMaterial color="#ff5b4a" emissive="#ff2f1b" emissiveIntensity={0.7} />
        </mesh>
      </group>
    </RigidBody>
  );
}

function Floor() {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <mesh receiveShadow position={[0, -0.02, 0]}>
          <boxGeometry args={[32, 0.08, 26]} />
          <meshStandardMaterial color="#d8e0d4" roughness={0.85} />
        </mesh>
        <CuboidCollider args={[16, 0.04, 13]} position={[0, -0.02, 0]} />
      </RigidBody>
      <gridHelper args={[32, 32, '#9aa79f', '#c3ccc6']} position={[0, 0.04, 0]} />
    </>
  );
}

function WorkshopProps() {
  const propData = useMemo(
    () => [
      [-3, 0.6, -1, '#e86f51', 'box'],
      [-2.2, 0.6, -1.8, '#4f86c6', 'box'],
      [4.6, 0.6, 1.5, '#f2c94c', 'box'],
      [5.5, 0.6, 2.2, '#6fcf97', 'box'],
      [-6, 0.4, 4.6, '#56616a', 'sensor'],
      [8.7, 0.4, -1.4, '#56616a', 'sensor'],
      [0.5, 0.55, -7.6, '#e45745', 'cone'],
      [1.6, 0.55, -7.1, '#e45745', 'cone'],
    ],
    [],
  );

  return (
    <>
      {propData.map(([x, y, z, color, type], index) => (
        <RigidBody key={`${type}-${index}`} position={[x, y, z]} restitution={0.35} friction={0.8}>
          {type === 'cone' ? (
            <mesh castShadow>
              <coneGeometry args={[0.32, 0.9, 24]} />
              <meshStandardMaterial color={color} roughness={0.68} />
            </mesh>
          ) : (
            <RoundedBox args={type === 'sensor' ? [0.75, 0.45, 0.5] : [0.8, 0.8, 0.8]} radius={0.06} smoothness={6} castShadow>
              <meshStandardMaterial color={color} roughness={0.7} />
            </RoundedBox>
          )}
        </RigidBody>
      ))}
      <RigidBody position={[-4.2, 0.26, 1.9]} restitution={0.2} friction={0.85}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 2.6, 16]} />
          <meshStandardMaterial color="#374149" roughness={0.72} />
        </mesh>
      </RigidBody>
      <RigidBody position={[3.8, 0.25, -2.2]} restitution={0.25} friction={0.82}>
        <mesh castShadow rotation={[0, Math.PI / 3, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 2.1, 16]} />
          <meshStandardMaterial color="#42505a" roughness={0.7} />
        </mesh>
      </RigidBody>
    </>
  );
}

function ProjectBeacon({ project, isNearest, isOpen, onSelect }) {
  const [x, , z] = project.zonePosition;
  const isCoachNova = project.id === 'coach-nova';

  return (
    <group position={[x, 0, z]}>
      <RigidBody type="fixed" colliders={false}>
        <mesh receiveShadow position={[0, 0.04, 0]}>
          <cylinderGeometry args={[2.3, 2.3, 0.08, 48]} />
          <meshStandardMaterial color={isCoachNova ? '#b9dbe8' : '#d4d7dc'} roughness={0.78} />
        </mesh>
        <CuboidCollider args={[2.25, 0.08, 2.25]} position={[0, 0.04, 0]} />
      </RigidBody>
      <mesh position={[0, 0.05, 0]}>
        <torusGeometry args={[2.45, 0.045, 12, 64]} />
        <meshStandardMaterial
          color={isNearest ? '#26d9ff' : '#5c6d75'}
          emissive={isNearest ? '#13bfe8' : '#000000'}
          emissiveIntensity={isNearest ? 0.8 : 0}
        />
      </mesh>
      <Billboard position={[0, 2.15, 0]}>
        <Text
          fontSize={0.36}
          maxWidth={3.8}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color="#1f2a32"
          outlineColor="#f9fbf7"
          outlineWidth={0.025}
        >
          {project.title}
        </Text>
        <Text
          position={[0, -0.44, 0]}
          fontSize={0.18}
          maxWidth={3.2}
          textAlign="center"
          color="#44525a"
          anchorX="center"
          anchorY="middle"
          outlineColor="#f9fbf7"
          outlineWidth={0.018}
        >
          {project.status}
        </Text>
      </Billboard>
      {isCoachNova ? <CoachNovaLab project={project} /> : <PlaceholderStation />}
      {isOpen && <ProjectExhibit project={project} onSelect={onSelect} />}
    </group>
  );
}

function CoachNovaLab({ project }) {
  const prototype = useTexture(project.assets.prototype);
  const circuit = useTexture(project.assets.circuit);

  return (
    <group>
      <mesh position={[-0.75, 0.62, 0.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 2.35, 18]} />
        <meshStandardMaterial color="#222b31" metalness={0.4} roughness={0.42} />
      </mesh>
      <mesh position={[-1.95, 0.62, 0.15]}>
        <boxGeometry args={[0.12, 0.5, 0.5]} />
        <meshStandardMaterial color="#2e3840" />
      </mesh>
      <mesh position={[0.45, 0.62, 0.15]}>
        <boxGeometry args={[0.12, 0.5, 0.5]} />
        <meshStandardMaterial color="#2e3840" />
      </mesh>
      <RoundedBox args={[1.25, 0.55, 0.08]} radius={0.04} smoothness={6} position={[0.95, 0.86, -1.15]} rotation={[0, -0.3, 0]}>
        <meshStandardMaterial color="#151d23" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0.95, 0.86, -1.205]} rotation={[0, -0.3, 0]}>
        <planeGeometry args={[1.05, 0.38]} />
        <meshBasicMaterial map={prototype} toneMapped={false} />
      </mesh>
      <RoundedBox args={[1.05, 0.75, 0.08]} radius={0.04} smoothness={6} position={[-1.15, 1, -1.1]} rotation={[0, 0.32, 0]}>
        <meshStandardMaterial color="#f2f5ee" roughness={0.62} />
      </RoundedBox>
      <mesh position={[-1.15, 1, -1.15]} rotation={[0, 0.32, 0]}>
        <planeGeometry args={[0.88, 0.58]} />
        <meshBasicMaterial map={circuit} toneMapped={false} />
      </mesh>
      <ArchitectureWall />
    </group>
  );
}

function ArchitectureWall() {
  const labels = ['ESP32 + IMU', 'Python Bridge', 'React UI', 'AI Coach'];

  return (
    <group position={[0, 0.8, 1.55]}>
      {labels.map((label, index) => (
        <group key={label} position={[-1.65 + index * 1.1, 0, 0]}>
          <RoundedBox args={[0.86, 0.42, 0.08]} radius={0.04} smoothness={6}>
            <meshStandardMaterial color={index % 2 ? '#dae6ef' : '#f2e4b7'} roughness={0.65} />
          </RoundedBox>
          <Text position={[0, 0, -0.06]} rotation={[0, Math.PI, 0]} fontSize={0.08} maxWidth={0.72} textAlign="center" color="#26323a">
            {label}
          </Text>
          {index < labels.length - 1 && (
            <Text position={[0.55, 0, -0.06]} rotation={[0, Math.PI, 0]} fontSize={0.16} color="#26323a">
              {'>'}
            </Text>
          )}
        </group>
      ))}
    </group>
  );
}

function PlaceholderStation() {
  return (
    <group>
      <RoundedBox args={[1.5, 0.42, 1]} radius={0.08} smoothness={8} position={[0, 0.28, 0]}>
        <meshStandardMaterial color="#aeb8bd" roughness={0.78} />
      </RoundedBox>
      <mesh position={[0, 0.72, 0]}>
        <octahedronGeometry args={[0.45]} />
        <meshStandardMaterial color="#7b8c96" roughness={0.48} metalness={0.18} />
      </mesh>
      <Text position={[0, 1.35, 0]} rotation={[-0.25, 0, 0]} fontSize={0.16} maxWidth={1.8} textAlign="center" color="#334047">
        Future project bay
      </Text>
    </group>
  );
}

function ProjectExhibit({ project }) {
  const isCoachNova = project.id === 'coach-nova';

  return (
    <Html position={[0, 2.75, 0]} center occlude={false}>
      <article className="world-exhibit">
        <div className="exhibit-kicker">{project.status}</div>
        <h2>{project.title}</h2>
        <p>{project.summary}</p>
        <p className="role">{project.role}</p>
        <div className="tag-row">
          {project.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        {isCoachNova && project.assets.demo && (
          <video className="demo-video" src={project.assets.demo} muted loop playsInline autoPlay controls />
        )}
        <div className="section-grid">
          {project.exhibitSections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        {project.references.length > 0 && (
          <div className="reference-list">
            <strong>Source context</strong>
            {project.references.map((reference) => (
              <code key={reference}>{reference}</code>
            ))}
          </div>
        )}
      </article>
    </Html>
  );
}

function Scene({ inputRef, mobileInputRef, robotPositionRef, robotPosition, selectedProject, onMove, onOpenProject }) {
  const nearest = getNearestProject(robotPosition);

  return (
    <Canvas shadows camera={{ position: [0, 7, 10], fov: 48 }}>
      <color attach="background" args={['#e9efe8']} />
      <fog attach="fog" args={['#e9efe8', 18, 34]} />
      <ambientLight intensity={0.75} />
      <directionalLight castShadow position={[6, 10, 6]} intensity={1.8} shadow-mapSize={[2048, 2048]} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <Floor />
          <WorkshopProps />
          {projects.map((project) => (
            <ProjectBeacon
              key={project.id}
              project={project}
              isNearest={nearest.project?.id === project.id && nearest.canInteract}
              isOpen={selectedProject?.id === project.id}
              onSelect={onOpenProject}
            />
          ))}
          <RoverRobot inputRef={inputRef} mobileInputRef={mobileInputRef} robotPositionRef={robotPositionRef} onMove={onMove} />
        </Physics>
        <ContactShadows position={[0, 0.05, 0]} opacity={0.35} scale={26} blur={2.8} far={9} />
        <Environment preset="city" />
      </Suspense>
      <CameraRig targetRef={robotPositionRef} />
    </Canvas>
  );
}

function TutorialPanel({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="tutorial-backdrop">
      <section className="tutorial-panel" aria-label="Portfolio tutorial">
        <div className="panel-heading">
          <span>Interactive Portfolio</span>
          <button type="button" onClick={onClose} aria-label="Close tutorial">
            x
          </button>
        </div>
        <h1>Drive the rover through my robotics workshop.</h1>
        <p>
          This portfolio is a playable project world. Each bay is a project exhibit; start with Coach NOVA to see the
          product, engineering system, media, and my role in the build.
        </p>
        <div className="tutorial-grid">
          <div>
            <strong>Move</strong>
            <span>WASD or arrow keys</span>
          </div>
          <div>
            <strong>Inspect</strong>
            <span>Press Enter near a glowing project ring</span>
          </div>
          <div>
            <strong>Close</strong>
            <span>Press Esc or use the close button</span>
          </div>
          <div>
            <strong>Mobile</strong>
            <span>Use the joystick and Inspect button</span>
          </div>
        </div>
        <button type="button" className="primary-button" onClick={onClose}>
          Start exploring
        </button>
      </section>
    </div>
  );
}

function Hud({ nearest, selectedProject, onOpen, onClose, onTutorial }) {
  return (
    <div className="hud">
      <div className="brand-block">
        <span>Shanthanu</span>
        <strong>Robotics Portfolio</strong>
      </div>
      <div className="status-pill">
        {nearest.canInteract ? `Enter: inspect ${nearest.project.title}` : 'Drive to a project bay'}
      </div>
      <div className="hud-actions">
        <button type="button" onClick={onTutorial}>
          Tutorial
        </button>
        {selectedProject ? (
          <button type="button" onClick={onClose}>
            Close
          </button>
        ) : (
          <button type="button" disabled={!nearest.canInteract} onClick={() => onOpen(nearest.project)}>
            Inspect
          </button>
        )}
      </div>
    </div>
  );
}

function MobileControls({ mobileInputRef, onInspect, canInspect }) {
  const padRef = useRef(null);
  const pointerId = useRef(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });

  const updateStick = useCallback(
    (event) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * -2;
      const length = Math.min(1, Math.hypot(x, y));
      const angle = Math.atan2(y, x);
      const next = {
        x: Math.cos(angle) * length,
        y: Math.sin(angle) * length,
      };
      mobileInputRef.current = next;
      setStick(next);
    },
    [mobileInputRef],
  );

  const stopStick = useCallback(() => {
    pointerId.current = null;
    mobileInputRef.current = { x: 0, y: 0 };
    setStick({ x: 0, y: 0 });
  }, [mobileInputRef]);

  return (
    <div className="mobile-controls">
      <div
        ref={padRef}
        className="stick-pad"
        onPointerDown={(event) => {
          pointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateStick(event);
        }}
        onPointerMove={(event) => {
          if (pointerId.current === event.pointerId) updateStick(event);
        }}
        onPointerUp={stopStick}
        onPointerCancel={stopStick}
      >
        <div
          className="stick-thumb"
          style={{
            transform: `translate(${stick.x * 28}px, ${stick.y * -28}px)`,
          }}
        />
      </div>
      <button type="button" disabled={!canInspect} onClick={onInspect}>
        Inspect
      </button>
    </div>
  );
}

export default function App() {
  const keyboardInput = useKeyboardInput();
  const mobileInput = useRef({ x: 0, y: 0 });
  const robotPositionRef = useRef({ x: 0, z: 3 });
  const [robotPosition, setRobotPosition] = useState({ x: 0, z: 3 });
  const [selectedProject, setSelectedProject] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => !window.localStorage.getItem('portfolioTutorialSeen'));
  const nearest = getNearestProject(robotPosition);
  const lastMoveUpdate = useRef(0);

  const onMove = useCallback((nextPosition) => {
    const now = performance.now();
    if (now - lastMoveUpdate.current < 80) return;
    lastMoveUpdate.current = now;
    setRobotPosition(nextPosition);
  }, []);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem('portfolioTutorialSeen', 'true');
    setTutorialOpen(false);
  }, []);

  const openProject = useCallback((project) => {
    if (project) setSelectedProject(project);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Enter' && nearest.canInteract) {
        setSelectedProject(nearest.project);
      }
      if (event.code === 'Escape') {
        if (selectedProject) setSelectedProject(null);
        else setTutorialOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nearest, selectedProject]);

  return (
    <main className="app-shell">
      <Scene
        inputRef={keyboardInput}
        mobileInputRef={mobileInput}
        robotPositionRef={robotPositionRef}
        robotPosition={robotPosition}
        selectedProject={selectedProject}
        onMove={onMove}
        onOpenProject={openProject}
      />
      <Hud
        nearest={nearest}
        selectedProject={selectedProject}
        onOpen={openProject}
        onClose={() => setSelectedProject(null)}
        onTutorial={() => setTutorialOpen(true)}
      />
      <MobileControls
        mobileInputRef={mobileInput}
        canInspect={nearest.canInteract}
        onInspect={() => openProject(nearest.project)}
      />
      <TutorialPanel isOpen={tutorialOpen} onClose={closeTutorial} />
    </main>
  );
}
