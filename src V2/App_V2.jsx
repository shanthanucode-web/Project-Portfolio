import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { ProjectExhibit } from './components/ExhibitOverlay';
import { Hud, MobileControls, TutorialPanel } from './components/Hud';
import { LoreChips, WorkshopSwitches } from './components/Interactions';
import { ProjectZones } from './components/ProjectZones';
import { RoverRobot } from './components/Robot';
import { SceneLighting, WorkshopFloor } from './components/World';
import { WorkshopProps } from './components/WorkshopProps';
import { projects } from './data/projects';
import { getLoreChips, getNearbyLore, getNearbySwitch, getNearestProject } from './game/proximity';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import './styles.css';

function CameraRig({ targetRef, selectedProject }) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const target = targetRef.current;
    if (!target) return;

    const distance = selectedProject ? 9.8 : 8.6;
    const height = selectedProject ? 8.2 : 7.3;
    desired.set(target.x, height, target.z + distance);
    camera.position.lerp(desired, 0.075);
    lookAt.set(target.x, 0.9, target.z - 0.25);
    camera.lookAt(lookAt);
  });

  return null;
}

function Scene({
  inputRef,
  mobileInputRef,
  robotPositionRef,
  robotPosition,
  selectedProject,
  nearestProject,
  loreChips,
  discoveredLoreIds,
  nearbyLore,
  nearbySwitch,
  activeSwitchIds,
  robotMood,
  onMove,
}) {
  return (
    <Canvas shadows camera={{ position: [0, 7.5, 10], fov: 46 }}>
      <SceneLighting />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <WorkshopFloor />
          <WorkshopProps />
          <ProjectZones projects={projects} nearestProject={nearestProject} activeSwitchIds={activeSwitchIds} />
          <LoreChips chips={loreChips} discoveredLoreIds={discoveredLoreIds} nearbyLore={nearbyLore} />
          <WorkshopSwitches activeSwitchIds={activeSwitchIds} nearbySwitch={nearbySwitch} />
          <RoverRobot
            inputRef={inputRef}
            mobileInputRef={mobileInputRef}
            robotPositionRef={robotPositionRef}
            onMove={onMove}
            mood={robotMood}
          />
        </Physics>
      </Suspense>
      <CameraRig targetRef={robotPositionRef} selectedProject={selectedProject} robotPosition={robotPosition} />
    </Canvas>
  );
}

export default function App() {
  const keyboardInput = useKeyboardInput();
  const mobileInput = useRef({ x: 0, y: 0 });
  const robotPositionRef = useRef({ x: 0, z: 3 });
  const [robotPosition, setRobotPosition] = useState({ x: 0, z: 3 });
  const [selectedProject, setSelectedProject] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => !window.localStorage.getItem('portfolioTutorialSeen'));
  const [discoveredLoreIds, setDiscoveredLoreIds] = useState([]);
  const [activeLore, setActiveLore] = useState(null);
  const [activeSwitchIds, setActiveSwitchIds] = useState([]);
  const [systemMessage, setSystemMessage] = useState('');
  const [robotMood, setRobotMood] = useState('idle');
  const lastMoveUpdate = useRef(0);
  const moodTimeout = useRef(null);
  const messageTimeout = useRef(null);
  const loreChips = useMemo(() => getLoreChips(projects), []);
  const nearestProject = getNearestProject(robotPosition, projects);
  const nearbyLore = getNearbyLore(robotPosition, loreChips, discoveredLoreIds);
  const nearbySwitch = getNearbySwitch(robotPosition);

  const setTemporaryMood = useCallback((mood) => {
    setRobotMood(mood);
    window.clearTimeout(moodTimeout.current);
    moodTimeout.current = window.setTimeout(() => setRobotMood('idle'), 1400);
  }, []);

  const showSystemMessage = useCallback((message) => {
    setSystemMessage(message);
    setActiveLore(null);
    window.clearTimeout(messageTimeout.current);
    messageTimeout.current = window.setTimeout(() => setSystemMessage(''), 3200);
  }, []);

  const onMove = useCallback((nextPosition) => {
    const now = performance.now();
    if (now - lastMoveUpdate.current < 70) return;
    lastMoveUpdate.current = now;
    setRobotPosition(nextPosition);
  }, []);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem('portfolioTutorialSeen', 'true');
    setTutorialOpen(false);
  }, []);

  const closeProject = useCallback(() => {
    setSelectedProject(null);
  }, []);

  const openProject = useCallback(
    (project) => {
      if (!project) return;
      setSelectedProject(project);
      setTemporaryMood('celebrate');
    },
    [setTemporaryMood],
  );

  const handleInteract = useCallback(() => {
    if (nearbyLore) {
      setDiscoveredLoreIds((prev) => (prev.includes(nearbyLore.id) ? prev : [...prev, nearbyLore.id]));
      setActiveLore(nearbyLore);
      setSystemMessage('');
      setTemporaryMood('celebrate');
      window.clearTimeout(messageTimeout.current);
      messageTimeout.current = window.setTimeout(() => setActiveLore(null), 6200);
      return;
    }

    if (nearbySwitch) {
      setActiveSwitchIds((prev) =>
        prev.includes(nearbySwitch.id) ? prev.filter((id) => id !== nearbySwitch.id) : [...prev, nearbySwitch.id],
      );
      showSystemMessage(nearbySwitch.message);
      setTemporaryMood('near');
    }
  }, [nearbyLore, nearbySwitch, setTemporaryMood, showSystemMessage]);

  useEffect(() => {
    if (nearbyLore || nearbySwitch || nearestProject.canInteract) {
      setRobotMood((current) => (current === 'celebrate' ? current : 'near'));
    } else {
      setRobotMood((current) => (current === 'near' ? 'idle' : current));
    }
  }, [nearbyLore, nearbySwitch, nearestProject.canInteract]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Enter' && nearestProject.canInteract) {
        setSelectedProject(nearestProject.project);
        setTemporaryMood('celebrate');
      }
      if (event.code === 'KeyE' || event.key?.toLowerCase() === 'e') {
        handleInteract();
      }
      if (event.code === 'Escape') {
        if (selectedProject) setSelectedProject(null);
        else setTutorialOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleInteract, nearestProject, selectedProject, setTemporaryMood]);

  useEffect(
    () => () => {
      window.clearTimeout(moodTimeout.current);
      window.clearTimeout(messageTimeout.current);
    },
    [],
  );

  return (
    <main className="app-shell">
      <Scene
        inputRef={keyboardInput}
        mobileInputRef={mobileInput}
        robotPositionRef={robotPositionRef}
        robotPosition={robotPosition}
        selectedProject={selectedProject}
        nearestProject={nearestProject}
        loreChips={loreChips}
        discoveredLoreIds={discoveredLoreIds}
        nearbyLore={nearbyLore}
        nearbySwitch={nearbySwitch}
        activeSwitchIds={activeSwitchIds}
        robotMood={robotMood}
        onMove={onMove}
      />
      <Hud
        nearest={nearestProject}
        selectedProject={selectedProject}
        nearbyLore={nearbyLore}
        nearbySwitch={nearbySwitch}
        discoveredCount={discoveredLoreIds.length}
        totalLoreCount={loreChips.length}
        activeLore={activeLore}
        systemMessage={systemMessage}
        onOpen={openProject}
        onClose={closeProject}
        onTutorial={() => setTutorialOpen(true)}
      />
      {selectedProject && (
        <ProjectExhibit project={selectedProject} onClose={closeProject} />
      )}
      <MobileControls
        mobileInputRef={mobileInput}
        canInspect={nearestProject.canInteract}
        canInteract={Boolean(nearbyLore || nearbySwitch)}
        onInspect={() => openProject(nearestProject.project)}
        onInteract={handleInteract}
      />
      <TutorialPanel isOpen={tutorialOpen} onClose={closeTutorial} />
    </main>
  );
}
