export const projects = [
  {
    id: 'coach-nova',
    title: 'Coach NOVA',
    slug: 'coach-nova',
    status: 'Featured Build',
    summary:
      'An AI-augmented wearable coaching platform for competitive powerlifters training without consistent coach access.',
    role:
      'I helped shape the product direction from field research through final demo, designing and integrating the wearable sensing loop, live workout interface, calibration system, AI feedback triggers, and the end-to-end prototype story.',
    tags: ['ESP32-C3', 'IMU', 'Python', 'React', 'OpenAI', 'Human-AI Design'],
    zonePosition: [-8, 0, -4],
    assets: {
      prototype: '/coach-nova/prototype.png',
      circuit: '/coach-nova/circuit.png',
      logo: '/coach-nova/logo.png',
    },
    loreChips: [
      {
        id: 'coach-nova-research-gap',
        title: 'Research signal',
        body:
          'The strongest user need was not another workout log. It was a missing real-time signal for fatigue, confidence, and form breakdown.',
        position: [-10.7, 0.55, -2.2],
      },
      {
        id: 'coach-nova-calibration',
        title: 'Calibration lesson',
        body:
          'Fixed velocity thresholds failed across athletes and loads, so the prototype moved to personal baselines before judging fatigue.',
        position: [-6.2, 0.55, -6.7],
      },
      {
        id: 'coach-nova-rest-window',
        title: 'Timing constraint',
        body:
          'The useful coaching moment is the rest window: sense during the lift, process quietly, then coach before the next set.',
        position: [-4.9, 0.55, -3.6],
      },
    ],
    exhibitSections: [
      {
        title: 'The question',
        body:
          "What does it actually feel like to train hard without a coach? That question took our team into Berkeley gyms for observation sessions, interviews, a personal training session, and workouts with friends, all before we committed to a product direction. The answer shaped everything: athletes aren't missing data, they're missing interpretation.",
      },
      {
        title: 'The gap',
        body:
          "Lifters could log weight and reps. They couldn't see fatigue, bar speed, or form breakdown in the moment. Existing wearables were physically removed during barbell work because wrist wraps and watches compete for the same space. The problem wasn't that athletes lacked discipline; it was that the tools available to them couldn't observe the thing that actually matters: the lift itself.",
      },
      {
        title: 'The system',
        body:
          'Coach NOVA mounts sensing to the barbell, validates reps through a Python signal-processing bridge with personal calibration baselines, streams live workout state to a React dashboard, and delivers AI coaching during the rest window rather than during the lift, exactly when an athlete can actually hear it.',
      },
    ],
    story: {
      timeline: [
        {
          label: 'Research',
          title: 'We started in the gym, not the codebase.',
          paragraphs: [
            "Before a single line of code was written, our five-person team spent time doing what most engineering projects skip: actually watching people train. We visited multiple gyms across Berkeley, took notes while observing how athletes moved through sessions, took a personal training session to understand how coaches track performance, and trained alongside friends to feel firsthand what it's like to have someone watching your reps.",
            "What came back from interviews with competitive and semi-competitive powerlifters wasn't a missing feature; it was a missing integrated view of readiness, fatigue, form, and context. One lifter had six years of experience and logged every session religiously in their phone's Notes app. They knew exactly what weight they'd hit the previous week. But they had no way of knowing when a squat was approaching failure. That gap between the data athletes already collect and the signal they actually need became the center of gravity for everything that followed.",
          ],
        },
        {
          label: 'Product Direction',
          title: 'The wearable had to move off the wrist.',
          paragraphs: [
            "One of the clearest patterns across our interviews was that wrist-based devices weren't just underused during lifting; they were actively removed. Wrist wraps and watches compete for the same space, and when an athlete has to choose between their setup and their tech, the tech loses every time. One participant described themselves as someone who needs conditions to be identical between sessions. Any friction in setup was enough for a device to get left in the gym bag permanently.",
            "That finding locked in a hardware direction before we'd touched a datasheet. If the sensor couldn't sit on the wrist, it needed to go somewhere that was already part of the lift. The barbell was the obvious answer: it's the one piece of equipment that moves through every rep, stays consistent across sessions, and doesn't ask the athlete to change anything about how they train.",
          ],
        },
        {
          label: 'Validation',
          title: 'Everything depended on one technical assumption.',
          paragraphs: [
            'Before building an AI coach, a training dashboard, or any of the experience layer, we needed to answer a harder question: can a barbell-mounted IMU reliably detect rep boundaries and velocity drops under real loading conditions, with enough accuracy to be useful and few enough false positives to be trusted?',
            'We scoped a focused validation test around a single gym session, video ground truth from a phone camera, and a simple pass-fail comparison against the signal processing pipeline. The plan was to run rep detection as a standalone module before touching BLE, the frontend, or the AI layer. Validate the sub-system first. Only then build on top of it.',
          ],
        },
        {
          label: 'Prototype',
          title: 'The first build was intentionally minimal.',
          paragraphs: [
            'The hardware stack came down to two components that were already in hand: an ESP32-C3 Super Mini as the microcontroller and a SparkFun LSM6DS3 6-axis IMU. Combined cost of additional materials: zero. Rather than prototyping on tape and hoping it held, we designed a custom 3D-printed two-piece hinged enclosure with dedicated pockets for every component, strap holes on both short ends for secure barbell mounting, and a USB cutout in the lid so the ESP32 can be reflashed in the field without cracking the enclosure open.',
          ],
        },
      ],
      media: [
        {
          src: '/coach-nova/prototype.png',
          alt: 'Coach NOVA prototype enclosure open, showing the ESP32-C3, IMU, battery, and barbell strap',
          caption:
            'Custom barbell-mounted enclosure housing the ESP32-C3, IMU, battery, and USB access, designed for secure mounting and easy reflashing.',
        },
        {
          src: '/coach-nova/circuit.png',
          alt: 'ESP32-C3 Super Mini and SparkFun LSM6DS3 IMU wired on breadboard',
          caption:
            'The minimal sensing stack: ESP32-C3 Super Mini paired with the SparkFun LSM6DS3 6-axis IMU over I2C.',
        },
      ],
      insights: [
        {
          title: 'The performance gap is invisible until you look for it.',
          body:
            "Lifters were tracking everything they could manually track: sets, weights, rest times. But the information that actually drives performance decisions was nowhere in that data. How close to failure was that last set? Is bar speed dropping? Is today's output different from last week's at the same weight? These questions don't have answers in a Notes app. Closing that gap was the product's entire reason for existing.",
        },
        {
          title: 'Coach trust is earned through observation, not instructions.',
          body:
            "The most memorable moment from our research was a participant whose bench press had plateaued at 150kg, not because of a physical ceiling, but because of a genuine fear of failing under heavy load. Their coach didn't prescribe a fix. They loaded the bar to 200kg with three spotters and let the athlete feel that the weight wouldn't hurt them. The plateau broke. What made that work wasn't data. It was a trusted observer making a call at the right moment. That's what Coach NOVA is trying to replicate.",
        },
        {
          title: 'Scope discipline is what kept the project alive.',
          body:
            "PPG sensors, EMG, BLE, nutrition tracking, menstrual cycle integration: every one of these was on the table at some point. Every one of them got deferred. Not because they aren't interesting, but because none of them were necessary to validate the core loop: sense the set, detect reps accurately, calibrate to the athlete, and deliver coaching during the rest window. Cutting scope on v1 is what made v1 possible.",
        },
      ],
      architecture: [
        'ESP32-C3 + LSM6DS3 IMU (barbell-mounted)',
        'USB serial at 115200 baud',
        'Python bridge (complementary filter, gravity compensation, velocity integration, rep validation)',
        'WebSocket ws://127.0.0.1:8765',
        'React + Vite (live workout dashboard, calibration baselines, session history)',
        'POST /api/coach',
        'Vite backend -> OpenAI Responses API (post-set coaching, post-workout summary, on-demand mid-workout chat)',
      ],
      buildNotes: [
        {
          title: 'Rep detection uses a pending-queue architecture.',
          body:
            'Firmware signals candidate reps, but nothing gets counted until a full descent-and-ascent phase is confirmed. This was the solution to a real failure mode: mid-descent acceleration spikes were triggering false counts in early testing. Queuing the candidate and waiting for the ascent confirmation eliminated that entirely.',
        },
        {
          title: 'Calibration is personal, not hardcoded.',
          body:
            'Early versions used fixed velocity thresholds. They failed immediately once we tested with different athletes and different loads: an elite lifter at 90% of max looks nothing like a newer athlete at 60%, and the system has to understand both. The fix was to establish baselines per athlete during a short calibration phase and measure fatigue relative to those personal numbers. Calibration-first is non-negotiable for strength training.',
        },
        {
          title: 'AI feedback has three entry points.',
          body:
            "Automatic post-set coaching fires after every set using the session context injected into the prompt: athlete name, training block, exercise, and the metrics from the set just completed. Automatic post-workout summary fires at the end of the session. On-demand chat lets the athlete ask the coach a question mid-workout, at any point. The three-trigger architecture meant the system could be useful even when athletes didn't initiate anything.",
        },
        {
          title: 'Timing shaped the whole system.',
          body:
            "Feedback delivered during a lift is a distraction. Feedback delivered one rep late, during rest, is useful. This wasn't obvious going in; the instinct is to make everything as real-time as possible. But once we understood that the feedback needed to land in the rest window rather than interrupt the set, it simplified a lot of architectural decisions about when to process, when to fire, and what latency was actually acceptable.",
        },
      ],
      reflections: [
        "Building Coach NOVA confirmed a few things I'll carry into every future project.",
        'The gap between "we talked to users" and "we actually went to the gym, trained alongside people, and observed what the environment actually demands" is enormous. The wrist hardware insight did not come from asking athletes whether they would use a barbell sensor. It came from watching them remove their watches before picking up the bar. You cannot get that from a survey.',
        "I also underestimated how much the AI analysis added to our research synthesis. My instinct was to treat the AI-assisted analysis as a sanity check on the human analysis, a way to confirm what we'd already found. What actually happened was that the AI pushed toward prioritization and feasibility in ways our team hadn't. We were drawn to the full ecosystem vision: training, nutrition, recovery, psychology. The AI analysis kept redirecting us toward the narrowest viable MVP. Both perspectives were necessary. Neither alone would have produced the same product.",
        'The hardest engineering lesson was that calibration cannot be an afterthought. We tried to skip it. Fixed thresholds felt simpler, and they worked fine in isolation. The moment we tested with a second athlete, the system broke. The pending-queue rep detection, the velocity baselines, the fatigue alerts, all of it becomes meaningless if the system does not know what "normal" looks like for this specific person under this specific load.',
      ],
      nextSteps: [
        {
          title: 'BLE integration',
          body:
            'The system currently communicates over USB serial, which tethers the hardware to a laptop. Cutting that cable means the sensor works anywhere in a gym, not just within cable distance of a computer. The branch is ready and the protocol is scoped.',
        },
        {
          title: 'Bar path deviation detection',
          body:
            'This would let the system flag when the bar is drifting laterally under fatigue, a signal that currently requires a coach to see. Most VBT tools report vertical velocity. Lateral drift is a different category of insight that would meaningfully differentiate Coach NOVA from every existing tool in the space.',
        },
        {
          title: 'Rep asymmetry detection',
          body:
            'This goes further still, identifying when one side of the body is contributing more than the other across a set. This kind of bilateral imbalance is a common precursor to injury and a genuine blind spot for athletes training alone. Detecting it automatically would be one of the strongest arguments for why this system matters.',
        },
      ],
    },
    references: [
      'Coach NOVA/README.md',
      'Coach NOVA/src/main.cpp',
      'Coach NOVA/app/live_bridge.py',
      'Coach NOVA/src/pages/LiveWorkoutPage.jsx',
    ],
  },
  {
    id: 'future-lab',
    title: 'Future Engineering Projects',
    slug: 'future-lab',
    status: 'Coming Soon',
    summary: 'A reserved space for future engineering case studies added to this portfolio world.',
    role: 'Reserved for upcoming engineering work.',
    tags: ['Robotics', 'Prototype', 'In Progress'],
    zonePosition: [7, 0, -5],
    assets: {},
    loreChips: [
      {
        id: 'future-lab-placeholder',
        title: 'Future engineering',
        body:
          'This space is reserved for future engineering projects as the portfolio grows.',
        position: [8.8, 0.55, -2.6],
      },
    ],
    exhibitSections: [
      {
        title: 'Future Engineering Projects',
        body:
          'This area is reserved for future engineering case studies and project artifacts.',
      },
    ],
    references: [],
  },
  {
    id: 'systems-bench',
    title: 'Future Engineering Projects',
    slug: 'systems-bench',
    status: 'Coming Soon',
    summary: 'A reserved space for future engineering case studies added to this portfolio world.',
    role: 'Reserved for upcoming engineering work.',
    tags: ['Firmware', 'Controls', 'Sensing'],
    zonePosition: [5.5, 0, 6.8],
    assets: {},
    loreChips: [
      {
        id: 'systems-bench-growth',
        title: 'Future engineering',
        body:
          'This space is reserved for future engineering projects as the portfolio grows.',
        position: [3.2, 0.55, 6.2],
      },
    ],
    exhibitSections: [
      {
        title: 'Future Engineering Projects',
        body:
          'This area is reserved for future engineering case studies and project artifacts.',
      },
    ],
    references: [],
  },
];
