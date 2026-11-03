export type DesignChoice = {
  id: string;
  name: string;
  description: string;
};

export const lockOptions: DesignChoice[] = [
  {
    id: "no-preference",
    name: "No preference yet",
    description: "The showroom can recommend a lock after the opening is measured.",
  },
  {
    id: "round-deadbolt",
    name: "Standard round deadbolt",
    description: "A round deadbolt in the usual position.",
  },
  {
    id: "single-key",
    name: "Single key",
    description: "One key operates the lock.",
  },
  {
    id: "smart-lock",
    name: "Smart lock",
    description: "A smart lock on the door.",
  },
  {
    id: "key-and-smart",
    name: "Key deadbolt with smart lock",
    description: "A keyed deadbolt together with a smart lock.",
  },
];

export const screenOptions: DesignChoice[] = [
  {
    id: "no",
    name: "No screen",
    description: "The door only.",
  },
  {
    id: "yes",
    name: "Add a screen",
    description: "Include a screen with this door.",
  },
];

export const sidelightOptions: DesignChoice[] = [
  {
    id: "none",
    name: "No sidelights",
    description: "Door without side lites.",
  },
  {
    id: "right",
    name: "Sidelight on the right",
    description: "One glass panel to the right of the door.",
  },
  {
    id: "left",
    name: "Sidelight on the left",
    description: "One glass panel to the left of the door.",
  },
  {
    id: "double",
    name: "Double sidelights",
    description: "A glass panel on both sides of the door.",
  },
];

export const jambOptions: DesignChoice[] = [
  {
    id: "unsure",
    name: "Not sure yet",
    description: "The team can confirm the wall depth.",
  },
  {
    id: "4-9-16",
    name: '4 9/16"',
    description: "A common depth for a standard wall.",
  },
  {
    id: "6",
    name: '6"',
    description: "A six-inch jamb.",
  },
  {
    id: "6-9-16",
    name: '6 9/16"',
    description: "A deeper jamb for a thicker wall.",
  },
  {
    id: "8",
    name: '8"',
    description: "An eight-inch jamb.",
  },
  {
    id: "other",
    name: "Other",
    description: "A different depth. Add it in the project notes.",
  },
];

export function choiceById(options: DesignChoice[], id: string) {
  return options.find((option) => option.id === id) ?? options[0];
}
