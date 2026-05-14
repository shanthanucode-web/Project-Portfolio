export const MOVE_SPEED = 5.8;
export const TURN_SPEED = 8.5;
export const ACCELERATION = 7.5;
export const INTERACT_RADIUS = 5;
export const LORE_RADIUS = 1.45;
export const SWITCH_RADIUS = 1.6;

export const WORLD_BOUNDS = {
  minX: -14,
  maxX: 14,
  minZ: -11,
  maxZ: 12,
};

export const workshopSwitches = [
  {
    id: 'coach-nova-power',
    label: 'Power up Coach NOVA bay',
    position: [-5.7, 0, -1.2],
    message: 'Coach NOVA bay lights are online.',
  },
  {
    id: 'bench-lights',
    label: 'Toggle bench diagnostics',
    position: [1.8, 0, 2.9],
    message: 'Diagnostics bench is scanning the workshop floor.',
  },
];
