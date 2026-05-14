import { useRef } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { workshopSwitches } from '../game/constants';

export function LoreChips({ chips, discoveredLoreIds, nearbyLore }) {
  return (
    <>
      {chips.map((chip) => (
        <LoreChip
          key={chip.id}
          chip={chip}
          discovered={discoveredLoreIds.includes(chip.id)}
          nearby={nearbyLore?.id === chip.id}
        />
      ))}
    </>
  );
}

function LoreChip({ chip, discovered, nearby }) {
  const group = useRef(null);
  const [x, y, z] = chip.position;

  useFrame((state) => {
    if (!group.current) return;
    group.current.position.y = y + Math.sin(state.clock.elapsedTime * 2.4 + x) * 0.08;
    group.current.rotation.y += 0.018;
  });

  if (discovered) return null;

  return (
    <group ref={group} position={[x, y, z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.12, 6]} />
        <meshStandardMaterial
          color={nearby ? '#a7ff83' : '#78e0ee'}
          emissive={nearby ? '#7dff52' : '#19bdd6'}
          emissiveIntensity={nearby ? 0.65 : 0.3}
          roughness={0.35}
          metalness={0.25}
        />
      </mesh>
      {nearby && (
        <Billboard position={[0, 0.75, 0]}>
          <Text fontSize={0.14} color="#172027" outlineColor="#f9fbf7" outlineWidth={0.02} maxWidth={1.8} textAlign="center">
            Press E to collect lore
          </Text>
        </Billboard>
      )}
    </group>
  );
}

export function WorkshopSwitches({ activeSwitchIds, nearbySwitch }) {
  return (
    <>
      {workshopSwitches.map((control) => (
        <WorkshopSwitch key={control.id} control={control} active={activeSwitchIds.includes(control.id)} nearby={nearbySwitch?.id === control.id} />
      ))}
    </>
  );
}

function WorkshopSwitch({ control, active, nearby }) {
  const [x, , z] = control.position;
  return (
    <group position={[x, 0.15, z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.42, 0.5, 0.24, 28]} />
        <meshStandardMaterial color="#43515a" roughness={0.5} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.12, 28]} />
        <meshStandardMaterial
          color={active ? '#a7ff83' : '#ff735f'}
          emissive={active ? '#7dff52' : '#ff2f1b'}
          emissiveIntensity={nearby || active ? 0.75 : 0.28}
          roughness={0.35}
        />
      </mesh>
      {nearby && (
        <Billboard position={[0, 0.95, 0]}>
          <Text fontSize={0.14} color="#172027" outlineColor="#f9fbf7" outlineWidth={0.02} maxWidth={1.9} textAlign="center">
            Press E: {control.label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}
