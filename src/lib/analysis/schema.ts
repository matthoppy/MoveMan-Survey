/** Tool schema Claude must fill in when it reads a survey video. */
export const SURVEY_TOOL_NAME = "record_survey";

export const SURVEY_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: {
      type: "string",
      description:
        "Two or three sentences describing the property and the move as a surveyor would note it: property type, apparent size, general condition and volume of goods, anything unusual.",
    },
    rooms: {
      type: "array",
      description: "Every room seen or mentioned in the survey.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: 'Room as the client named it, e.g. "Master bedroom", "Kitchen", "Garage".',
          },
          packingLevel: {
            type: "string",
            enum: ["none", "part", "full"],
            description:
              "How much of this room the removals crew must pack. 'none' if the client says they will pack it themselves or it is already boxed, 'full' if they ask the crew to pack everything, 'part' if only some contents (e.g. just the fragile items).",
          },
          notes: { type: "string", description: "Anything the client said about this room specifically." },
        },
        required: ["name", "packingLevel"],
      },
    },
    items: {
      type: "array",
      description:
        "Every distinct item of furniture, appliance or packed carton that is going on the van. Do not list items the client says are being left behind, sold or disposed of.",
      items: {
        type: "object",
        properties: {
          room: { type: "string", description: "Room this item is in, matching one of the room names." },
          name: {
            type: "string",
            description:
              'Plain description, e.g. "3-seater sofa", "double wardrobe", "fridge freezer", "packed medium cartons".',
          },
          quantity: { type: "integer", minimum: 1 },
          estimatedCuFt: {
            type: "number",
            description:
              "Your own volume estimate per single unit in cubic feet. Only used when the item cannot be matched to the standard volume table.",
          },
          fragile: { type: "boolean" },
          dismantle: { type: "boolean", description: "True if it must be taken apart to get it out of the room." },
          notes: { type: "string", description: "Condition, access difficulty, or what the client said about it." },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "How sure you are this item exists and is going. Lower it when the view is poor or the audio unclear.",
          },
          timestampSec: {
            type: "number",
            description: "Approximate seconds into the video where this item appears, if known.",
          },
        },
        required: ["room", "name", "quantity", "fragile", "dismantle", "confidence"],
      },
    },
    accessObservations: {
      type: "object",
      description: "Anything visible or stated about access at the property being surveyed.",
      properties: {
        floor: { type: "integer", minimum: 0, maximum: 4, description: "Floor the property is on, 0 for ground." },
        liftAvailable: { type: "boolean" },
        awkwardStairs: { type: "boolean", description: "Narrow, winding or steep stairs; tight turns on a landing." },
        parkingRestricted: { type: "boolean", description: "No driveway, permit zone, narrow street, double yellows." },
        hoistRequired: { type: "boolean", description: "Something will not fit down the stairs and must go out of a window." },
        notes: { type: "string" },
      },
    },
    flags: {
      type: "array",
      items: { type: "string" },
      description:
        "Things a human surveyor must confirm: rooms never shown on camera, contradictory statements, obscured areas, items you could not identify, loft or garage mentioned but not filmed.",
    },
  },
  required: ["summary", "rooms", "items", "flags"],
};

export interface RawAnalysisItem {
  room: string;
  name: string;
  quantity: number;
  estimatedCuFt?: number;
  fragile: boolean;
  dismantle: boolean;
  notes?: string;
  confidence: number;
  timestampSec?: number;
}

export interface RawAnalysis {
  summary: string;
  rooms: Array<{ name: string; packingLevel: "none" | "part" | "full"; notes?: string }>;
  items: RawAnalysisItem[];
  accessObservations?: {
    floor?: number;
    liftAvailable?: boolean;
    awkwardStairs?: boolean;
    parkingRestricted?: boolean;
    hoistRequired?: boolean;
    notes?: string;
  };
  flags: string[];
}
