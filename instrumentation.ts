// Runs once when the hub's server starts: starts the playback engine timer (titles moving on, scheduled starts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startEngineTimer } = await import('./lib/playback');
  startEngineTimer();
}
