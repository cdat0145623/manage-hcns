import { eq } from "drizzle-orm";
import { frequences } from "@kan/db/schema";
import type { dbClient } from "@kan/db/client";

import { generateUID } from "@kan/shared";

export const create = async (
    db: dbClient,
    frequenceInput: {
        name: string,
        rrule: string,
        dtStart: Date,
    }
) => {
    if (!frequenceInput.rrule) {
    throw new Error("rrule is required");
  }

  if (!frequenceInput.dtStart) {
    throw new Error("dtStart is required");
  }

  const [frequence] = await db
    .insert(frequences)
    .values({
      name: frequenceInput.name,
      rruleString: frequenceInput.rrule,
      dtStart: frequenceInput.dtStart,
    })
    .returning({
      id: frequences.id,
      name: frequences.name,
      rrule: frequences.rruleString,
      dtStart: frequences.dtStart,
    });

  if (!frequence) {
    throw new Error("Failed to create frequence");
  }

  return frequence;
}

export const update = async (
    db: dbClient,
    frequenceInput: {
        id: string,
        name?: string,
        rrule?: string,
        dtStart?: Date,
    }
) => {
  const [frequence] = await db
    .update(frequences)
    .set({
      name: frequenceInput.name,
      rruleString: frequenceInput.rrule,
      dtStart: frequenceInput.dtStart,
    })
    .where(eq(frequences.id, frequenceInput.id))
    .returning({
      id: frequences.id,
      name: frequences.name,
      rrule: frequences.rruleString,
      dtStart: frequences.dtStart,
    });

  if (!frequence) {
    throw new Error("Failed to update frequence");
  }

  return frequence;
}