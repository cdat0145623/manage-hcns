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
    const [frequence] = await db
    .insert(frequences)
    .values({
        id: generateUID(),
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
    return frequence;
}