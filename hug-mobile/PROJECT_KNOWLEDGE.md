# HUG Mobile — immutable rules

- Exactly two inputs: `SCHOOL_IDENTITY`, `ADULT_IDENTITY`.
- Location/environment is reconstructed from `SCHOOL_IDENTITY`.
- `MEETING_REFERENCE_FRAME` is generated, never uploaded.
- Identity preservation outranks beauty.
- Memory continuity outranks generic cinematic beauty.
- Adult enters from screen-right.
- Same real person at two ages, represented as two physically separate bodies.
- No morphing, portals, teleporting, fantasy glow, identity blending, extra people, body fusion, camera redesign or aggressive zoom.
- Approved MASTER_FIRST_FRAME defines the immutable camera/environment contract.
- GitHub branch `hug-mobile` is the canonical development/source branch for this mobile implementation.
- Vercel runs the UI/server runtime.
- Vercel Blob is the persistent store for private source photos, generated frames/video, job state, provider job IDs and sanitized diagnostics.
- Supabase is not part of the HUG runtime architecture.
- API and storage secrets remain server-side only; never write them to Git, localStorage or diagnostics.
