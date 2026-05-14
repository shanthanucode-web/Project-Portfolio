import { INTERACT_RADIUS, LORE_RADIUS, SWITCH_RADIUS, workshopSwitches } from './constants';

export function getNearestProject(robotPosition, projects) {
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

export function getLoreChips(projects) {
  return projects.flatMap((project) =>
    (project.loreChips || []).map((chip) => ({
      ...chip,
      projectId: project.id,
      projectTitle: project.title,
    })),
  );
}

export function getNearbyLore(robotPosition, loreChips, discoveredLoreIds) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const chip of loreChips) {
    if (discoveredLoreIds.includes(chip.id)) continue;
    const [x, , z] = chip.position;
    const distance = Math.hypot(robotPosition.x - x, robotPosition.z - z);
    if (distance < nearestDistance) {
      nearest = chip;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= LORE_RADIUS ? nearest : null;
}

export function getNearbySwitch(robotPosition) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const control of workshopSwitches) {
    const [x, , z] = control.position;
    const distance = Math.hypot(robotPosition.x - x, robotPosition.z - z);
    if (distance < nearestDistance) {
      nearest = control;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= SWITCH_RADIUS ? nearest : null;
}
