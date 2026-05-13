export const projects = [
  {
    id: 'coach-nova',
    title: 'Coach NOVA',
    slug: 'coach-nova',
    status: 'Featured Build',
    summary:
      'A real-time AI coaching platform that combines a barbell-mounted IMU, Python signal processing, and a React dashboard for powerlifting feedback.',
    role:
      'Designed and integrated the wearable sensing pipeline, live workout interface, AI feedback loop, and prototype system story.',
    tags: ['ESP32-C3', 'IMU', 'Python', 'React', 'OpenAI', 'Human-AI Design'],
    zonePosition: [-8, 0, -4],
    assets: {
      prototype: '/coach-nova/prototype.png',
      circuit: '/coach-nova/circuit.png',
      logo: '/coach-nova/logo.png',
    },
    exhibitSections: [
      {
        title: 'Product',
        body:
          'Coach NOVA gives lifters a live training companion: rep count, velocity proxy, tilt, fatigue signals, chat, and post-set coaching in one dashboard.',
      },
      {
        title: 'Engineering',
        body:
          'The system runs from ESP32-C3 and LSM6DS3 sensor data into a Python bridge, then streams structured set data to a React app and AI coach.',
      },
      {
        title: 'My Role',
        body:
          'I shaped the end-to-end prototype: hardware wiring, motion analysis, calibration behavior, dashboard flows, and the coaching narrative.',
      },
    ],
    references: [
      'Coach NOVA/README.md',
      'Coach NOVA/src/main.cpp',
      'Coach NOVA/app/live_bridge.py',
      'Coach NOVA/src/pages/LiveWorkoutPage.jsx',
    ],
  },
  {
    id: 'future-lab',
    title: 'Next Robotics Project',
    slug: 'future-lab',
    status: 'Coming Soon',
    summary: 'A placeholder bay for the next project folder added to this portfolio world.',
    role: 'Reserved for the next build story.',
    tags: ['Robotics', 'Prototype', 'In Progress'],
    zonePosition: [7, 0, -5],
    assets: {},
    exhibitSections: [
      {
        title: 'Future Exhibit',
        body:
          'This bay is wired into the same project registry, so a future folder can become a full interactive exhibit without rebuilding the world.',
      },
    ],
    references: [],
  },
  {
    id: 'systems-bench',
    title: 'Systems Bench',
    slug: 'systems-bench',
    status: 'Coming Soon',
    summary: 'A staging area for firmware, sensing, or controls projects.',
    role: 'Reserved for deeper engineering case studies.',
    tags: ['Firmware', 'Controls', 'Sensing'],
    zonePosition: [4, 0, 8],
    assets: {},
    exhibitSections: [
      {
        title: 'Placeholder',
        body:
          'This station is intentionally present so the portfolio already feels like a growing workshop instead of a one-project page.',
      },
    ],
    references: [],
  },
];
