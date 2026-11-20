// Runs once when the hub's server starts: starts the playback engine timer (titles moving on, scheduled starts).
// The import sits inside the NEXT_RUNTIME check so the edge build (middleware) leaves the database code out.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEngineTimer } = await import('./lib/playback');
    startEngineTimer();
    // PP4: snap back for TVs in kid mode (every 2 seconds).
    const { startSnapBackWatcher } = await import('./lib/snapback');
    startSnapBackWatcher();
    // PP5: routine schedules and timers (every 15 seconds), and the Family Album sync check (every 10 minutes).
    const { startRoutineTimer } = await import('./lib/routines');
    startRoutineTimer();
    const { startAlbumTimer } = await import('./lib/album');
    startAlbumTimer();
    // PP7: on Windows and Mac the hub service (scripts/hub-service.mjs) runs the app. Windows ends a task without a
    // signal, so the app checks every 5 seconds that the service is still there and stops with it (otherwise the
    // next start would find the port taken).
    const parent = Number(process.env.PP_SUPERVISOR_PID);
    if (parent > 0) {
      setInterval(() => {
        try {
          process.kill(parent, 0);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EPERM') process.exit(0);
        }
      }, 5000).unref();
    }
  }
}
