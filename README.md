# Roof Raise Visualizer

Photograph a house, enter a few dimensions, and see what a steeper roof, a hip conversion or dormers would look like, before anyone frames anything. It also checks the new ridge against a height limit and estimates how much of the attic becomes usable.

Everything runs in the browser. Photos never leave the device; only the numbers are saved (in `localStorage`).

## How it works

1. **Map tab:** search any address (or use your location) to get a satellite view, tap three corners of the roof, and drag the corners to fit. It measures the roof outline, subtracts the eave overhang you set, and fills in the house's length and span. Imagery is Esri World Imagery; address search is OpenStreetMap Nominatim (one search per submit, no autocomplete, per its usage policy).
2. **Photo tab:** take or upload a straight-on photo of the long side or the gable end, then tap four points: left eave, right eave, existing ridge, and the ground below the left eave. The eave-to-eave distance (the house's length or span) scales the photo, so eave height and existing rise are measured from it automatically. The proposed roof, dormers, 7 ft headroom line and height limit are drawn over the photo. "Adjust points" lets you drag taps with a magnifier.
3. **Drawing tab:** a scaled elevation of either side with dimensions.
4. **3D tab:** a rotatable massing model with the old roof as a dashed wireframe and the height limit as a red plane.

### Outputs

- New ridge height vs. the height limit
- Pitch (X:12 and degrees), old vs. new
- Attic floor area with 7 ft+ and 5 ft+ headroom, split into main roof and dormers
- Roof surface area (and roofing squares), gable-end wall area
- Warnings: over the limit, crowded dormers, dormers too tall for the ridge

### Assumptions

- Rectangular footprint; the existing roof is treated as a gable.
- The attic floor sits at the eave line.
- Shed dormers tie in 1 ft below the ridge; gable dormers have an 8:12 roof and count for half the headroom gain of a shed dormer of the same width.
- No overhangs, no perspective correction (shoot straight-on).

These are planning estimates. Confirm heights, habitable-space rules and setbacks with your local code and a design professional.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # geometry + photo calibration tests
npm run build
```

Stack: Next.js (App Router), React, three.js, plain CSS. Geometry lives in `lib/roof.ts`, photo calibration in `lib/photo.ts`.
