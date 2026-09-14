# Optional AI image-to-video
Runway Gen-4 Turbo integration uses up to three 5-second image-to-video tasks per video. Final assembly remains 15 seconds; other shots retain source media. Generated clips go into the existing source ZIP/XML export.

Render environment: set RUNWAYML_API_SECRET privately and AI_VIDEO_ENABLED=true after funding the Runway developer account and approving usage. Never put the key in client code or source control. Default is disabled; without activation the app uses source photos and does not claim AI generation.

Costs: consult https://docs.dev.runwayml.com/usage/billing/ before enabling. Each public app job can create paid tasks when enabled. Restrict access and configure provider spending controls before exposing paid generation to unrestricted users. Automatic paid retries are disabled. Provider failures fail the job without silently presenting photos as AI results. Timed-out remote tasks can still finish and consume credits; their task IDs are recorded in the storyboard while the process is alive.

Mock/API contract tests do not establish successful paid generation. A real test with configured credentials is still required. AI may alter packaging; review outputs before use.
