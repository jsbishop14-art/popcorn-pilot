-- 006_channel: PP6, the Popcorn Pilot Roku channel. Between titles the TV shows the Now playing bridge screen (up
-- next, a countdown, Play now, Skip), and a time warning still due in the middle of an episode briefly brings up the
-- channel's warning screen before the title is opened again (handoff 6.7 and 9.5). Only on TVs whose channel is
-- paired (a channel token); other TVs go straight to the next title, as before.
-- The Pi updater (scripts/migrate.mjs --verify) reads these objects back after applying this file.
-- expect: column playback.bridge_until
-- expect: column playback.warn_resume_at

-- When the bridge screen is up (no title on, the next one waiting): when the next title starts (epoch ms).
ALTER TABLE playback ADD COLUMN bridge_until INTEGER;
-- When the warning screen is up over a title: when the hub opens that title again (epoch ms).
ALTER TABLE playback ADD COLUMN warn_resume_at INTEGER;
