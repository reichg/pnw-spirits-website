// Layout placeholders for the public /classes no-data preview.
// These power the page layout before any real class content exists; remove or
// replace them once classes are entered via the admin. Dates are fixed ISO
// strings (deterministic) so the preview renders consistently.

import type { ClassSessionView } from "@/components/Class/ClassSessions";
import type { ClassPhotoView } from "@/services/classes/classView";

export const placeholderClass: { title: string; description: string } = {
  title: "Pacific Northwest Craft Cocktail Workshop",
  description:
    "Spend an evening shaking, stirring, and tasting your way through small-batch PNW spirits. " +
    "Our bartenders guide you from foraged garnishes to your own signature pour.",
};

export const placeholderSessions: ClassSessionView[] = [
  {
    id: 1,
    startTime: "2026-07-18T18:00:00-07:00",
    endTime: "2026-07-18T20:00:00-07:00",
    location: "Capitol Hill Tasting Room, Seattle, WA",
  },
  {
    id: 2,
    startTime: "2026-08-15T18:30:00-07:00",
    endTime: "2026-08-15T20:30:00-07:00",
    location: "Pearl District Loft, Portland, OR",
  },
  {
    id: 3,
    startTime: "2026-09-12T17:00:00-07:00",
    endTime: "2026-09-12T19:00:00-07:00",
    location: "Waterfront Distillery, Tacoma, WA",
  },
];

// Preview tiles never display a real image (PreviewPhoto renders a styled
// placeholder), so url is null; only the caption is shown.
export const placeholderPhotos: ClassPhotoView[] = [
  {
    id: 1,
    url: null,
    caption: "Foraged garnishes from the Cascades",
  },
  {
    id: 2,
    url: null,
    caption: "Pouring a small-batch PNW gin",
  },
  {
    id: 3,
    url: null,
    caption: "Guests at the shaking station",
  },
  {
    id: 4,
    url: null,
    caption: "Fresh citrus prep before service",
  },
  {
    id: 5,
    url: null,
    caption: "A flight of finished cocktails",
  },
  {
    id: 6,
    url: null,
    caption: "Cheers to a great class",
  },
];
