import { business, serviceCities } from "@/lib/business";
import type { Faq } from "@/lib/seo";

const cityList = serviceCities.join(", ");

export const homeFaqs: Faq[] = [
  {
    question: "Who makes custom iron entry doors in Las Vegas?",
    answer: `Artistic Entrances designs custom iron entry doors for luxury homes in greater Las Vegas. The showroom is at ${business.street}, ${business.city}, ${business.region} ${business.postalCode}. Call ${business.phoneDisplay} or use Design Your Door to record a style, glass type, handle, and finish.`,
  },
  {
    question: "How much does a custom iron door cost?",
    answer:
      "Artistic Entrances quotes each door after reviewing the opening size, glass, hardware, finish, and whether the project needs delivery or installation. A published purchase offer is a $500 Amazon gift card with a qualifying custom iron entry door. Terms apply, and the offer is not an automatic discount on the website.",
  },
  {
    question: "Can I choose the glass, handle, and finish?",
    answer:
      "Yes. The designer records clear, frosted, rain, or Aquatex glass, plus the handle, finish, lock, screen, sidelights, and jamb. The door photo stays as it was taken. The team confirms those choices before anything is built.",
  },
  {
    question: "Do you install iron doors in Las Vegas?",
    answer: `White-glove delivery and professional installation are available by request for homes in ${cityList}. Projects outside greater Las Vegas can still be submitted and are followed up by conversation.`,
  },
];

export const designFaqs: Faq[] = [
  {
    question: "Does the preview show the finished door?",
    answer:
      "The large photo is the door you picked, in the finish already on that image. Glass, handle, lock, screen, sidelights, and jamb are listed next to it and are not painted onto the photo. Choose As shown to keep that pictured finish, or pick another finish such as matte black. A combined mockup is prepared only after you submit your contact details, and only for projects in greater Las Vegas.",
  },
  {
    question: "What glass types are available?",
    answer:
      "Clear glass keeps the view open. Frosted glass softens light and adds privacy. Rain glass uses a vertical texture. Aquatex glass has a wavy, water-like texture that obscures the view. The team confirms the glass can be built for the door you chose.",
  },
  {
    question: "What happens after I request a quote?",
    answer:
      "Your name, phone, email, ZIP code, and the exact door, glass, handle, and finish are saved to the Artistic Entrances follow-up system. Someone from the team contacts you about measurements and pricing. If the ZIP code is outside greater Las Vegas, the request goes to a conversational follow-up instead of an automated mockup.",
  },
  {
    question: "Why do you ask for permission to text?",
    answer:
      "The quote form includes consent to receive calls and texts about that quote. Message and data rates may apply. Consent is not a condition of purchase. Details are on the privacy page.",
  },
];

export const lasVegasFaqs: Faq[] = [
  {
    question: "Which Las Vegas neighborhoods do you serve?",
    answer: `Artistic Entrances serves ${cityList}. Use your ZIP code on the quote form. Greater Las Vegas requests are eligible for a door mockup. Addresses outside that area are still accepted and are handled in a conversation.`,
  },
  {
    question: "Where is the Artistic Entrances showroom?",
    answer: `The showroom is at ${business.street}, ${business.city}, ${business.region} ${business.postalCode}. Hours are ${business.hoursLabel}. The direct line is ${business.phoneDisplay}.`,
  },
  {
    question: "Can you work with a Las Vegas builder or architect?",
    answer:
      "Yes. Homeowners, contractors, and builders can send a door design, plans, or a photo of the current entry. The team reviews swing, threshold, hardware prep, glass, and finish before production.",
  },
  {
    question: "How long does a custom iron door take in Las Vegas?",
    answer:
      "After you approve the drawing, a custom door usually takes 8 to 16 weeks. Doors that are already built can be browsed at artisticentrances.shop. Artistic Entrances confirms the timeline for your opening when the quote is prepared.",
  },
];

export const projectFaqs: Faq[] = [
  {
    question: "Are these photos of doors Artistic Entrances installed?",
    answer:
      "Yes. The project gallery shows installed entries, patio doors, glass, and hardware from Artistic Entrances work. The catalog gallery is the larger set of styles you can start a design from.",
  },
  {
    question: "Can my door look like one of these projects?",
    answer:
      "Use a project photo as the reference, then choose a catalog door and record glass, handle, finish, lock, screen, sidelights, and jamb. The showroom confirms the opening before anything is built.",
  },
  {
    question: "Do the photos include the smart lock and the screen?",
    answer:
      "Some do. One close view shows a keyed lock next to a smart lock and lever handles. Screens, sidelights, and jamb depth are choices in the designer and are confirmed for your wall.",
  },
  {
    question: "Where are the Google reviews from?",
    answer: `The quotes on this site are from the Artistic Entrances Google Business Profile. The full set is on Google. The showroom phone on this website is ${business.phoneDisplay}.`,
  },
];

export const galleryFaqs: Faq[] = [
  {
    question: "Are the gallery doors the only designs available?",
    answer:
      "No. The gallery is a starting point. Proportions, glass, scrollwork, and finish can be adjusted, or a design can be developed from architectural drawings.",
  },
  {
    question: "How do I design one of these doors?",
    answer:
      "Open a door and choose glass, handle, and finish on the Design Your Door page. Submitting your contact information sends those selections to Artistic Entrances.",
  },
  {
    question: "Why do some doors use a number instead of a collection name?",
    answer:
      "The photo library still uses catalog image numbers. Search by that number, then the team can match it to a collection name during the quote.",
  },
  {
    question: "Can I get the full iron door catalog?",
    answer:
      "Yes. The catalog page collects your contact details so Artistic Entrances can send sizing, finish, and customization information. It does not replace the door designer.",
  },
];

export const catalogFaqs: Faq[] = [
  {
    question: "What do I receive when I request the catalog?",
    answer:
      "Artistic Entrances uses your request to send catalog information with sizing notes, finish choices, and customization ideas. A person follows up. The form does not unlock an unattended file download.",
  },
  {
    question: "Is the $500 Amazon gift card included with the catalog?",
    answer:
      "No. The published offer is a $500 Amazon gift card when you purchase a qualifying custom iron entry door. Terms and conditions apply. Mention the offer when you call or request a quote.",
  },
  {
    question: "Does a catalog request save a door design?",
    answer:
      "A catalog request saves your contact information and ZIP code. To save a door, glass type, handle, and finish, use Design Your Door.",
  },
  {
    question: "Who should request the catalog?",
    answer:
      "Homeowners, builders, and contractors comparing iron entry doors for a Las Vegas home can request it. Out-of-area requests are still delivered to the team for a conversation.",
  },
];

export const aboutFaqs: Faq[] = [
  {
    question: "What does Artistic Entrances make?",
    answer:
      "Artistic Entrances makes custom iron entry doors for luxury homes, including single doors, double doors, and designs with glass and decorative ironwork.",
  },
  {
    question: "Where is Artistic Entrances located?",
    answer: `The company is in Las Vegas at ${business.street}, ${business.city}, ${business.region} ${business.postalCode}. The public phone number is ${business.phoneDisplay} and the email is ${business.email}.`,
  },
  {
    question: "Can a door from the photos be changed?",
    answer:
      "Yes. Treat the photos as starting points. Glass style, hardware, finish, and proportions can be reviewed against your opening and architecture.",
  },
  {
    question: "How does a project start?",
    answer:
      "Start with the gallery, request the catalog, or design a door and send a quote request. Have a rough opening size or plans ready when the team calls.",
  },
];

export const contactFaqs: Faq[] = [
  {
    question: "What is the fastest way to reach Artistic Entrances?",
    answer: `Call ${business.phoneDisplay} during ${business.hoursLabel}, or send the contact form. Email ${business.email} if you already have door reference numbers.`,
  },
  {
    question: "What should I have ready for a quote?",
    answer:
      "A door number or photo, the rough opening or plans, the preferred glass, and the finish family are enough to start. The team confirms measurements before production.",
  },
  {
    question: "Will you text me after I submit the form?",
    answer:
      "Only if you check the consent box. That permission covers calls and texts about your request. It is not required in order to buy a door.",
  },
  {
    question: "Do you reply the same day?",
    answer: `The team responds during ${business.hoursLabel}. Requests sent outside those hours are handled on the next open day.`,
  },
];

export const privacyFaqs: Faq[] = [
  {
    question: "What information does a form collect?",
    answer:
      "Quote, catalog, and contact forms collect your name, email, phone, ZIP code, and project notes. A quote also stores the door, the catalog photo of that door, glass, handle, finish, lock, screen, sidelights, and jamb. An optional photo of your current entry can be attached.",
  },
  {
    question: "Where does that information go?",
    answer:
      "Submissions are sent to the Artistic Entrances customer system so the team can follow up. Door selections are stored on your contact record. They are not sold as a list.",
  },
  {
    question: "Do I have to agree to texts?",
    answer:
      "The forms ask for permission to call and text about the request you submitted. You can still call the showroom if you do not want to use the form. Consent is not a condition of purchase. Message and data rates may apply.",
  },
  {
    question: "How do I ask about my information?",
    answer: `Email ${business.email} or call ${business.phoneDisplay} and ask the team about the details you submitted.`,
  },
];
