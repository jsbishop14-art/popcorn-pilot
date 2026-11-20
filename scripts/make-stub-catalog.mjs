#!/usr/bin/env node
// Generate the stub catalog (catalog-stub/titles.json and small placeholder cover art in catalog-stub/art/).
// The stub stands in for TMDB until Josh enters a key, and always in CI and build sessions. Every name is invented.
// Usage: node scripts/make-stub-catalog.mjs   (the output is committed; re-running gives the same files)
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'catalog-stub');
const COLORS = ['#8FB3FF', '#7FC8A9', '#FF8A65', '#FFC94A', '#C9A7F5', '#B8C4DA', '#A8D8F0', '#F5B7A1', '#9FD8C2', '#FFE08A', '#D3C2F5', '#C5D3A8'];

// [id, kind, name, year, rating, services, seasons (show: episode counts per season) or runtime (movie), episode minutes, similar ids, overview]
const T = [
  // Netflix shows
  [9001, 'show', 'Rocket Pals', 2023, 'TV-Y', ['netflix'], [10, 10], 22, [9002, 9005, 9006, 9104], 'Three friends build a cardboard rocket and visit a new planet every episode.'],
  [9002, 'show', 'Ocean Friends', 2022, 'TV-Y', ['netflix'], [12], 11, [9001, 9005, 9101, 9201], 'A little submarine and its fish friends explore the reef.'],
  [9003, 'show', 'Big Truck Town', 2021, 'TV-Y7', ['netflix'], [8, 8, 8], 24, [9004, 9103, 8003], 'Diggers, dump trucks and a crane named Gus fix up a busy town.'],
  [9004, 'show', 'Star Club', 2024, 'TV-Y7', ['netflix'], [10], 23, [9003, 9001, 9202], 'Kids at a backyard telescope club solve space puzzles.'],
  [9005, 'show', 'Garden Bugs', 2020, 'TV-Y', ['netflix'], [13, 13], 12, [9002, 9001, 9203], 'Tiny gardeners with big ideas look after a rooftop garden.'],
  [9006, 'show', 'Moon Camp', 2022, 'TV-G', ['netflix', 'hulu'], [9], 25, [9001, 9004, 9203], 'A summer camp on the moon, with campfire songs in low gravity.'],
  [9007, 'show', 'Night Harbor', 2023, 'TV-MA', ['netflix'], [8, 8], 52, [9105, 9204], 'A harbor town hides a smuggling ring. For adults.'],
  [9008, 'show', 'Kitchen Clash', 2024, 'TV-14', ['netflix'], [10], 44, [9204, 9105], 'Home cooks face off in timed challenges.'],
  // Netflix movies
  [8001, 'movie', 'Snow Pups', 2021, 'G', ['netflix', 'prime'], 84, null, [8002, 8101, 8201], 'Three puppies get lost in a snowstorm and find their way home.'],
  [8002, 'movie', 'Tiny Train', 2019, 'G', ['netflix'], 78, null, [8001, 8004, 8102], 'A toy train sets off across the living room on a big adventure.'],
  [8003, 'movie', 'Robot Recess', 2022, 'PG', ['netflix'], 92, null, [8005, 9003, 8102], 'A school robot learns how to play at recess.'],
  [8004, 'movie', 'Cloud Kitchen', 2020, 'G', ['netflix'], 81, null, [8002, 8201, 9203], 'A baker in the clouds makes rain out of soup.'],
  [8005, 'movie', 'Dino Dig', 2023, 'PG', ['netflix'], 95, null, [8003, 8202], 'Cousins find a dinosaur egg in grandma’s garden.'],
  [8006, 'movie', 'Last Signal', 2022, 'R', ['netflix'], 118, null, [8104, 8203], 'A radio operator hears a call that should not exist. For adults.'],
  [8007, 'movie', 'City of Glass', 2021, 'PG-13', ['netflix'], 109, null, [8103, 8203], 'An architect races to save her tower before it opens.'],
  // Prime Video shows
  [9101, 'show', 'Puddle Jumpers', 2022, 'TV-Y', ['prime'], [12, 12], 11, [9002, 9201, 9103], 'Two frogs and a duck jump into every puddle in town.'],
  [9102, 'show', 'Lantern Lane', 2021, 'TV-G', ['prime'], [10], 22, [9006, 9203, 9101], 'Neighbors on a quiet street light lanterns for each holiday.'],
  [9103, 'show', 'Brave Little Boat', 2023, 'TV-Y7', ['prime'], [10, 10], 24, [9003, 9101, 9202], 'A tugboat helps big ships into the harbor.'],
  [9104, 'show', 'Desert Patrol', 2020, 'TV-14', ['prime'], [8, 8], 45, [9105, 9204], 'Rangers keep watch over a desert park.'],
  [9105, 'show', 'The Long Con', 2024, 'TV-MA', ['prime'], [6], 55, [9007, 9204], 'A crew of swindlers plans one last job. For adults.'],
  // Prime Video movies
  [8101, 'movie', 'Paper Kites', 2020, 'G', ['prime'], 80, null, [8001, 8201, 8102], 'A girl and her grandfather build a kite for the town festival.'],
  [8102, 'movie', 'Marble Run', 2022, 'PG', ['prime'], 88, null, [8002, 8003, 8101], 'A marble rolls through a house built of traps and ramps.'],
  [8103, 'movie', 'Iron Orchard', 2023, 'PG-13', ['prime'], 112, null, [8007, 8203], 'Two families fight over an apple orchard.'],
  [8104, 'movie', 'Cold Front', 2021, 'R', ['prime'], 121, null, [8006, 8203], 'A storm traps strangers in a mountain lodge. For adults.'],
  // Hulu shows
  [9201, 'show', 'Bubble Bakery', 2023, 'TV-Y', ['hulu'], [13], 11, [9002, 9101, 9005], 'A bakery where every cake floats away.'],
  [9202, 'show', 'Sock Puppet Band', 2022, 'TV-Y7', ['hulu'], [10, 10], 22, [9004, 9103, 9201], 'A band of sock puppets plays a new song each week.'],
  [9203, 'show', 'Farmhouse Friends', 2021, 'TV-G', ['hulu'], [12, 12, 12], 22, [9005, 9102, 9006], 'Life on a small farm, one gentle chore at a time.'],
  [9204, 'show', 'Precinct 9', 2023, 'TV-14', ['hulu'], [18, 18], 43, [9104, 9008], 'Detectives work the night shift.'],
  [9205, 'show', 'Static', 2024, 'TV-MA', ['hulu'], [8], 50, [9007, 9105], 'A hacker uncovers a city-wide secret. For adults.'],
  // Hulu movies
  [8201, 'movie', 'Pillow Fort', 2021, 'G', ['hulu'], 76, null, [8001, 8004, 8101], 'Siblings build a pillow fort that becomes a kingdom.'],
  [8202, 'movie', 'Owl Night', 2022, 'PG', ['hulu'], 90, null, [8005, 8102], 'A boy follows an owl through the woods one night.'],
  [8203, 'movie', 'Harbor Lights', 2020, 'PG-13', ['hulu'], 104, null, [8007, 8103], 'A ferry captain’s last season on the bay.'],
  [8204, 'movie', 'The Basement Tapes', 2023, null, ['hulu'], 97, null, [8104, 8006], 'Found footage from a house sale. Not rated.'],
];

// Content ids for a deep link, known for a few titles so both launch routes are exercised by the stub.
const CONTENT_IDS = { 9001: { netflix: '81000001' }, 8001: { netflix: '81000101' } };

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function words(name) {
  const out = [];
  let line = '';
  for (const w of name.split(' ')) {
    if (line && (line + ' ' + w).length > 11) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

function poster(name, color, kind) {
  const lines = words(name);
  const y0 = 120 - (lines.length - 1) * 13;
  const text = lines.map((l, i) => `<text x="80" y="${y0 + i * 26}">${esc(l)}</text>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240" viewBox="0 0 160 240">` +
    `<rect width="160" height="240" rx="12" fill="${color}"/>` +
    `<circle cx="132" cy="30" r="44" fill="#FFFFFF" fill-opacity=".25"/>` +
    `<g font-family="Fredoka, Nunito, sans-serif" font-size="21" font-weight="700" fill="#0F1B33" text-anchor="middle">${text}</g>` +
    `<text x="80" y="218" font-family="Nunito, sans-serif" font-size="12" font-weight="800" fill="#0F1B33" fill-opacity=".7" text-anchor="middle">${kind === 'show' ? 'SERIES' : 'MOVIE'}</text>` +
    `</svg>\n`
  );
}

const key = (id) => `${id >= 9000 ? 'tv' : 'movie'}-${id}`;

fs.rmSync(path.join(OUT, 'art'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'art'), { recursive: true });
const titles = T.map(([id, kind, name, year, rating, services, sizes, episodeMinutes, similar, overview], i) => {
  const color = COLORS[i % COLORS.length];
  const art = `stub-${id}.svg`;
  fs.writeFileSync(path.join(OUT, 'art', art), poster(name, color, kind));
  return {
    key: key(id),
    kind,
    name,
    year,
    rating,
    services,
    overview,
    seasons: kind === 'show' ? sizes.map((episodes, n) => ({ number: n + 1, episodes })) : [],
    episodeMinutes: kind === 'show' ? episodeMinutes : null,
    runtimeMinutes: kind === 'movie' ? sizes : null,
    poster: art,
    trailer: `stub${id}`,
    similar: similar.map(key),
    contentIds: CONTENT_IDS[id] ?? {},
    popularity: 1000 - i,
  };
});
fs.writeFileSync(path.join(OUT, 'titles.json'), JSON.stringify({ note: 'Stub catalog. Every name is invented. Made by scripts/make-stub-catalog.mjs.', titles }, null, 1) + '\n');
console.log(`stub catalog: ${titles.length} titles, ${titles.length} posters in ${path.relative(process.cwd(), OUT)}`);
