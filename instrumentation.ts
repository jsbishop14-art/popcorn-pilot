// Runs once when the hub's server starts: starts the playback engine timer (titles moving on, scheduled starts).
// The import sits inside the NEXT_RUNTIME check so the edge build (middleware) leaves the database code out.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEngineTimer } = await import('./lib/playback');
    startEngineTimer();
  }
}
