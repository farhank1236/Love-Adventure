/* Aethelos kingdom: the fixed geography (regions, rivers, roads, height shaping) of the open world.
   Units are metres. +x = east, -z = north, y = up. The map spans -SIZE/2 .. SIZE/2 on x and z.
   Placed objects (houses, trees, lamps ...) are NOT here: they live in the editable object list built by
   kingdom-objects.js, so the editor can move them and save/load them as JSON. */
(() => {
  const A = window.Aethelos ||= {};
  const SIZE = 1200;

  // ---------------------------------------------------------------- named areas (location banner + map later)
  // shape: circle {x,z,r} — first match wins, so small areas are listed before the large ones they sit in.
  const REGIONS = [
    { id: 'dawnmeadow', name: 'Dawnmeadow', sub: 'Safe Haven', x: 0, z: 380, r: 70 },
    { id: 'palace', name: 'Royal Palace', sub: 'Seat of the Crown', x: 0, z: -262, r: 92 },
    { id: 'city', name: 'Main City', sub: 'Aethelgard', x: 0, z: 0, r: 142 },
    { id: 'aldmere', name: 'House Aldmere', sub: 'Western Gardens', x: -392, z: -52, r: 92 },
    { id: 'brenmoor', name: 'House Brenmoor', sub: 'Southern Granaries', x: -352, z: 432, r: 84 },
    { id: 'varkhold', name: 'House Varkhold', sub: 'Mountain Bastion', x: 318, z: -318, r: 84 },
    { id: 'farms', name: 'Farm Valley', sub: 'Fields of the Realm', x: -265, z: 235, r: 150 },
    { id: 'arena', name: 'The Shattered Crown', sub: 'Boss Arena', x: 410, z: -492, r: 46 },
    { id: 'forest', name: 'Moonpine Forest', sub: 'Wildwood', x: 330, z: 190, r: 230 },
    { id: 'mountains', name: 'Ironpeak Mountains', sub: 'The Northern Teeth', x: 180, z: -470, r: 330 },
    { id: 'river', name: 'Silvermere River', sub: '', river: 'silvermere' }
  ];

  // ---------------------------------------------------------------- rivers: centre line, width (m)
  const RIVERS = [
    { id: 'silvermere', name: 'Silvermere River', width: 20, pts: [
      [-470, -600], [-430, -470], [-330, -360], [-240, -250], [-198, -130], [-190, -20], [-178, 90],
      [-150, 175], [-100, 255], [-40, 300], [55, 330], [140, 390], [210, 470], [250, 600]] },
    { id: 'moonbrook', name: 'Moonbrook', width: 11, pts: [
      [470, -600], [450, -470], [420, -360], [400, -260], [360, -150], [300, -60], [262, 40],
      [250, 140], [230, 240], [200, 330], [160, 382]] },
    { id: 'millrace', name: 'Millrace', width: 6, pts: [   // irrigation branch through Farm Valley
      [-162, 152], [-210, 175], [-260, 205], [-318, 240], [-360, 290], [-372, 345]] }
  ];

  // ---------------------------------------------------------------- roads: width, surface ('cobble' | 'dirt' | 'royal')
  const ROADS = [
    { id: 'kings-way', name: "King's Way", width: 8, surface: 'cobble', pts: [[0, 350], [0, 270], [3, 200], [0, 142]] },
    { id: 'royal-road', name: 'Royal Road', width: 11, surface: 'royal', grade: 10, profile: 'ramp', pts: [[0, -142], [0, -190], [0, -222], [0, -258]] },
    { id: 'west-road', name: 'Aldmere Road', width: 7, surface: 'cobble', pts: [[-142, 0], [-190, -8], [-250, -24], [-320, -40], [-356, -48]] },
    { id: 'farm-road', name: 'Harvest Road', width: 6, surface: 'dirt', pts: [[-20, 180], [-80, 190], [-150, 200], [-215, 222], [-262, 236]] },
    { id: 'brenmoor-road', name: 'Granary Lane', width: 6, surface: 'dirt', pts: [[-262, 236], [-290, 300], [-320, 360], [-342, 404]] },
    { id: 'east-road', name: 'Moonpine Road', width: 7, surface: 'dirt', pts: [[142, 0], [190, 30], [240, 80], [290, 150], [330, 196]] },
    { id: 'forest-loop', name: 'Pinewhisper Path', width: 4, surface: 'dirt', pts: [[330, 196], [400, 160], [450, 220], [420, 300], [340, 300], [290, 260], [330, 196]] },
    { id: 'mountain-road', name: 'Ironpeak Pass', width: 6, surface: 'dirt', grade: 28, shoulder: 30, pts: [[100, -100], [150, -150], [210, -190], [250, -240], [282, -290], [300, -318]] },
    { id: 'mine-road', name: 'Miners Climb', width: 5, surface: 'dirt', grade: 28, shoulder: 30, pts: [[318, -350], [300, -400], [262, -430], [232, -470]] },
    { id: 'arena-road', name: 'Crown Path', width: 5, surface: 'dirt', grade: 28, shoulder: 30, pts: [[340, -350], [372, -410], [400, -450]] },
    { id: 'city-ring', name: 'Ring Street', width: 6, surface: 'cobble', loop: true, pts: (() => {
      const p = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; p.push([Math.cos(a) * 82, Math.sin(a) * 82]); } return p; })() },
    { id: 'city-ns', name: 'Crown Street', width: 7, surface: 'cobble', pts: [[0, 142], [0, 30], [0, -30], [0, -142]] },
    { id: 'city-ew', name: 'Market Street', width: 7, surface: 'cobble', pts: [[-142, 0], [-30, 0], [30, 0], [142, 0]] },
    { id: 'city-ne', name: 'Guild Row', width: 5, surface: 'cobble', pts: [[0, 0], [58, -58], [100, -100]] }
  ];

  // ---------------------------------------------------------------- height shaping
  // flats: blend terrain toward a level inside r (fully) .. r+edge (blend)
  const FLATS = [
    { x: 0, z: 0, r: 132, edge: 40, h: 6 },          // city
    { x: 0, z: -262, r: 74, edge: 46, h: 22 },       // palace plateau
    { x: 0, z: 380, r: 62, edge: 40, h: 5 },         // Dawnmeadow
    { x: -265, z: 235, r: 120, edge: 50, h: 3 },     // Farm Valley floor
    { x: -392, z: -52, r: 70, edge: 40, h: 8 },      // Aldmere gardens
    { x: -352, z: 432, r: 62, edge: 36, h: 3 },      // Brenmoor
    { x: 318, z: -318, r: 60, edge: 34, h: 34 },     // Varkhold shelf
    { x: 410, z: -492, r: 40, edge: 26, h: 62 },     // boss arena shelf
    { x: 250, z: -470, r: 26, edge: 22, h: 46 }      // mine mouth
  ];
  // mountain massifs: ridged peaks inside a soft mask
  const MASSIFS = [
    { x: 170, z: -520, rx: 330, rz: 120, h: 150 },
    { x: 470, z: -330, rx: 150, rz: 230, h: 130 },
    { x: -330, z: -540, rx: 260, rz: 110, h: 120 },
    { x: -560, z: -260, rx: 90, rz: 200, h: 80 },
    { x: 560, z: 120, rx: 70, rz: 260, h: 55 }
  ];

  A.Layout = { SIZE, REGIONS, RIVERS, ROADS, FLATS, MASSIFS, SPAWN: { x: 0, z: 368, yaw: Math.PI } };
})();
