# Aarogya Drishti interface system

The interface serves health workers, clinicians and administrators moving a saved patient record from registration through screening, review and follow-up. It presents real record and job states. The visual design uses the [UI UX Pro Max healthcare and accessibility guidance](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) as a starting point, adapted to a dense working dashboard and an Indian community-care setting. The repository's marketing patterns, testimonials and invented proof points do not apply to this product.

The civic navigation direction also draws on the National Informatics Centre's [UXDT guidance for navigation](https://www.uxdt.nic.in/guidelines/ux-design-guidelines/navigation-elements/) and [inclusive government digital services](https://www.uxdt.nic.in/guidelines/introduction/objective-of-the-guidelines/): clear page hierarchy, multilingual controls, keyboard access and responsive menus. The care-record language is informed by the [Ayushman Bharat Digital Mission's description of connected personal health records and consent](https://abdm.gov.in/strapicms/uploads/My_Health_Records_English_641e50a49b.pdf). Aarogya Drishti is a local research prototype and is not an official government service or an ABDM integration. No government emblem or mission logo is used.

## Visual language

| Role | Value | Use |
| --- | --- | --- |
| Indigo rail | `#172e3d` | Navigation and brand anchor |
| Action teal | `#0a7167` | Primary actions and active navigation |
| Ivory paper | `#f8f5ee` | Page background |
| Surface | `#fffdfa` | Forms, tables and record panels |
| Main text | `#19373c` | Headings and body text |
| Muted text | `#5d7175` | Supporting copy with readable contrast |
| Marigold accent | `#bf722c` | Restrained emphasis, never the only status signal |

Figtree carries English UI text and Noto Sans Telugu supports Telugu labels. Segoe UI, Nirmala UI and system sans-serif provide offline fallbacks. The regular body size is 16px. Headings use weight and spacing for hierarchy; long Telugu labels and record IDs must wrap rather than clip. A subtle jaali-inspired geometric texture appears in the hero; it is decorative and stays behind text. The drishti eye mark and warm photo frames give the product a distinct identity without introducing clinical claims.

Navigation and controls use one consistent outlined SVG icon family. Decorative icons have `aria-hidden="true"`; icon-only controls keep accessible names. Actions use at least 44px targets, visible keyboard focus, clear disabled states and small motion that respects reduced-motion settings. Dynamic record status always has text as well as color.

## Layout and behavior

- At desktop widths, a deep teal rail anchors navigation and the content uses distinct welcome, action, metric and record regions.
- The rail groups Overview, the patient care journey and resources; it keeps the local prototype identity, connection state, language switch and signed-in role visible. Active navigation has text, color and an edge marker, with `aria-current` for assistive technology. Consultations appears only for medical officers and specialists; audit appears only for administrators.
- At tablet and phone widths, the rail becomes a dismissible overlay; forms and care cards stack without horizontal page scrolling.
- Screening records show the protected image, saved experimental AI source and current job state. The status and provenance are separate from clinician-authored decisions.
- Clinical review, care coordination and video screens keep their real forms and role restrictions. The overview pathway is labeled as a guide; actual patient progress comes from saved records.
- Registration and completed-appointment acknowledgements are generated from authorized saved records. A distinct A4 print sheet uses the same brand and accessible type, while clearly saying it is not a clinical report or payment receipt.
- Consultations use an original illustration of an Indian clinician and community health worker. It is marked as illustrative artwork, separate from patient records. Appointments are grouped by schedule: ready now, upcoming and past. Each new appointment gets an opaque Jitsi room; scheduled cards can open that room for a connection check or copy the patient invitation. Completed and cancelled appointments cannot issue new app call access.
- Overview, Patients, Screening, Clinical review and Visual references each use a distinct original Indian care illustration. Visual references also retains its supplied oral photographs with neutral captions. Care coordination and audit use their own illustrations of follow-up planning and record stewardship. Page artwork sits beside the real forms and tables and never substitutes for protected screening photographs or saved care data.
- The login page explains the workflow while keeping authentication and offline vault access visible. Its owner-supplied clinic photograph and all page artwork have provenance captions. They illustrate the care setting and are not patient record data.

Check the rendered app at 375, 768, 1024 and 1440px; keyboard focus; English and Telugu; loading and empty states; and the browser print report. Automated code tests and visual browser checks cover different risks, so neither alone certifies field usability or clinical readiness.
