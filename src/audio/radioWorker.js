import { SONGS, renderSong } from './radio.js';

// Renders the radio songs off the main thread, as soon as the page loads.
for (const name of Object.keys(SONGS)) {
  const data = renderSong(SONGS[name]);
  self.postMessage({ name, data }, [data.buffer]);
}
